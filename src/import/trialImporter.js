import { pool } from "../../db.js";

/**
 * Checks for an existing trial using its source case ID.
 *
 * This check runs inside the transaction immediately
 * before insertion.
 *
 * @param {object} connection
 * @param {string} sourceCaseId
 * @returns {Promise<object|null>}
 */
async function findExistingTrial(
  connection,
  sourceCaseId
) {
  const [rows] = await connection.execute(
    `
      SELECT
        id,
        source_case_id
      FROM trials
      WHERE source_case_id = ?
      LIMIT 1
    `,
    [sourceCaseId]
  );

  return rows[0] ?? null;
}

/**
 * Inserts one fully prepared trial record.
 *
 * The order of these values must match the order
 * of the columns in the INSERT statement.
 *
 * @param {object} connection
 * @param {Record<string, unknown>} record
 * @param {{
 *   defendant: { defendant_id: number },
 *   judge: { judge_id: number },
 *   offence: { offence_id: number }
 * }} relations
 *
 * @returns {Promise<number>}
 */
async function insertTrial(
  connection,
  record,
  relations
) {
  const [result] = await connection.execute(
    `
      INSERT INTO trials (
        source_case_id,
        trial_date,
        defendant_name,
        offence,
        verdict,
        source_url,
        trial_location,
        judge_name,
        case_summary,
        trial_type,
        defendant_age,
        witness_count,
        sentence_duration,
        appeal_outcome,
        defendant_id,
        judge_id,
        offence_id
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
    `,
    [
      record.source_case_id,
      record.trial_date,
      record.defendant_name,
      record.offence,
      record.verdict,
      record.source_url,
      record.trial_location,
      record.judge_name,
      record.case_summary,
      record.trial_type,
      record.defendant_age,
      record.witness_count,
      record.sentence_duration,
      record.appeal_outcome,
      relations.defendant.defendant_id,
      relations.judge.judge_id,
      relations.offence.offence_id,
    ]
  );

  return result.insertId;
}

/**
 * Imports one resolved trial using its own transaction.
 *
 * Possible statuses:
 * - INSERTED
 * - DATABASE_DUPLICATE
 * - UNRESOLVED
 * - FAILED
 *
 * @param {{
 *   rowNumber: number,
 *   record: Record<string, unknown>,
 *   defendant: object|null,
 *   judge: object|null,
 *   offence: object|null,
 *   missingReferences: string[]
 * }} item
 *
 * @returns {Promise<{
 *   rowNumber: number,
 *   record: Record<string, unknown>,
 *   status: string,
 *   trialId?: number,
 *   existingTrialId?: number,
 *   errors?: string[]
 * }>}
 */
export async function importTrialWithTransaction(
  item
) {
  if (
    !item.defendant ||
    !item.judge ||
    !item.offence ||
    item.missingReferences.length > 0
  ) {
    return {
      rowNumber: item.rowNumber,
      record: item.record,
      status: "UNRESOLVED",
      errors: item.missingReferences,
    };
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const existingTrial =
      await findExistingTrial(
        connection,
        item.record.source_case_id
      );

    if (existingTrial) {
      await connection.rollback();

      return {
        rowNumber: item.rowNumber,
        record: item.record,
        status: "DATABASE_DUPLICATE",
        existingTrialId: existingTrial.id,
      };
    }

    const trialId = await insertTrial(
      connection,
      item.record,
      {
        defendant: item.defendant,
        judge: item.judge,
        offence: item.offence,
      }
    );

    await connection.commit();

    return {
      rowNumber: item.rowNumber,
      record: item.record,
      status: "INSERTED",
      trialId,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error(
        "Trial rollback failed:",
        rollbackError.message
      );
    }

    /*
     * MySQL error 1062 means the unique source_case_id
     * constraint stopped a duplicate insertion.
     */
    if (
      error.errno === 1062 ||
      error.code === "ER_DUP_ENTRY"
    ) {
      return {
        rowNumber: item.rowNumber,
        record: item.record,
        status: "DATABASE_DUPLICATE",
        errors: [
          "The source case ID already exists.",
        ],
      };
    }

    return {
      rowNumber: item.rowNumber,
      record: item.record,
      status: "FAILED",
      errors: [error.message],
    };
  } finally {
    connection.release();
  }
}

/**
 * Imports multiple resolved trials sequentially.
 *
 * Sequential processing is intentionally used for
 * the first importer version because it is easier
 * to monitor and troubleshoot safely.
 *
 * @param {Array<object>} relationResults
 * @returns {Promise<Array<object>>}
 */
export async function importResolvedTrials(
  relationResults
) {
  const results = [];

  for (const item of relationResults) {
    const result =
      await importTrialWithTransaction(item);

    results.push(result);
  }

  return results;
}