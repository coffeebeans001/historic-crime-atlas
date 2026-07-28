import { pool } from "../../db.js";

/**
 * Finds an existing trial by its stable source case ID.
 *
 * @param {string} sourceCaseId
 * @returns {Promise<object|null>}
 */
export async function findTrialBySourceCaseId(
  sourceCaseId
) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        source_case_id,
        trial_date,
        defendant_name,
        offence,
        verdict
      FROM trials
      WHERE source_case_id = ?
      LIMIT 1
    `,
    [sourceCaseId]
  );

  return rows[0] ?? null;
}

/**
 * Checks unique valid CSV records against existing trials.
 *
 * @param {Array<{
 *   rowNumber: number,
 *   record: Record<string, unknown>
 * }>} uniqueRecords
 *
 * @returns {Promise<{
 *   readyRecords: Array<{
 *     rowNumber: number,
 *     record: Record<string, unknown>
 *   }>,
 *   databaseDuplicates: Array<{
 *     rowNumber: number,
 *     record: Record<string, unknown>,
 *     existingTrial: object
 *   }>
 * }>}
 */
export async function detectDatabaseDuplicates(
  uniqueRecords
) {
  const readyRecords = [];
  const databaseDuplicates = [];

  for (const item of uniqueRecords) {
    const existingTrial =
      await findTrialBySourceCaseId(
        item.record.source_case_id
      );

    if (existingTrial) {
      databaseDuplicates.push({
        rowNumber: item.rowNumber,
        record: item.record,
        existingTrial,
      });

      continue;
    }

    readyRecords.push(item);
  }

  return {
    readyRecords,
    databaseDuplicates,
  };
}