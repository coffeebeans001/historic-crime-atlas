import { pool } from "../../db.js";

/**
 * Finds a defendant by exact name.
 *
 * @param {string} defendantName
 * @returns {Promise<object|null>}
 */
export async function findDefendantByName(defendantName) {
  const [rows] = await pool.execute(
    `
      SELECT
        defendant_id,
        defendant_name,
        age,
        gender,
        party_type
      FROM defendants
      WHERE defendant_name = ?
      LIMIT 1
    `,
    [defendantName]
  );

  return rows[0] ?? null;
}

/**
 * Finds a judge by exact name.
 *
 * @param {string} judgeName
 * @returns {Promise<object|null>}
 */
export async function findJudgeByName(judgeName) {
  const [rows] = await pool.execute(
    `
      SELECT
        judge_id,
        judge_name,
        court_affiliation
      FROM judges
      WHERE judge_name = ?
      LIMIT 1
    `,
    [judgeName]
  );

  return rows[0] ?? null;
}

/**
 * Finds an offence by exact name.
 *
 * @param {string} offenceName
 * @returns {Promise<object|null>}
 */
export async function findOffenceByName(offenceName) {
  const [rows] = await pool.execute(
    `
      SELECT
        offence_id,
        offence_name,
        category,
        offence_group,
        subcategory
      FROM offences
      WHERE offence_name = ?
      LIMIT 1
    `,
    [offenceName]
  );

  return rows[0] ?? null;
}

/**
 * Resolves all related database records for one trial.
 *
 * @param {Record<string, unknown>} record
 * @returns {Promise<{
 *   defendant: object|null,
 *   judge: object|null,
 *   offence: object|null,
 *   missingReferences: string[]
 * }>}
 */
export async function resolveTrialRelations(record) {
  const [defendant, judge, offence] = await Promise.all([
    findDefendantByName(record.defendant_name),
    findJudgeByName(record.judge_name),
    findOffenceByName(record.offence),
  ]);

  const missingReferences = [];

  if (!defendant) {
    missingReferences.push(
      `Defendant not found: ${record.defendant_name}`
    );
  }

  if (!judge) {
    missingReferences.push(
      `Judge not found: ${record.judge_name}`
    );
  }

  if (!offence) {
    missingReferences.push(
      `Offence not found: ${record.offence}`
    );
  }

  return {
    defendant,
    judge,
    offence,
    missingReferences,
  };
}