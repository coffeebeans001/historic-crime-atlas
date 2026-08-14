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
 * Creates a new defendant.
 *
 * @param {{
 *   defendant_name: string,
 *   defendant_age?: number|null,
 *   gender?: string|null
 * }} record
 *
 * @returns {Promise<{
 *   defendant_id: number,
 *   defendant_name: string,
 *   age: number|null,
 *   gender: string|null,
 *   party_type: string
 * }>}
 */
export async function createDefendant(record) {
  const defendantName = record.defendant_name;
  const age = record.defendant_age ?? null;
  const gender = record.gender ?? "Unknown";
  const partyType = "Individual";

  const [result] = await pool.execute(
    `
      INSERT INTO defendants (
        defendant_name,
        age,
        gender,
        party_type
      )
      VALUES (?, ?, ?, ?)
    `,
    [
      defendantName,
      age,
      gender,
      partyType,
    ]
  );

  return {
    defendant_id: result.insertId,
    defendant_name: defendantName,
    age,
    gender,
    party_type: partyType,
  };
}

/**
 * Finds an existing defendant or optionally creates one.
 *
 * @param {Record<string, unknown>} record
 * @param {{ createIfMissing?: boolean }} options
 *
 * @returns {Promise<{
 *   defendant: object|null,
 *   created: boolean
 * }>}
 */
export async function resolveDefendant(
  record,
  { createIfMissing = false } = {}
) {
  const existingDefendant =
    await findDefendantByName(record.defendant_name);

  if (existingDefendant) {
    return {
      defendant: existingDefendant,
      created: false,
    };
  }

  if (!createIfMissing) {
    return {
      defendant: null,
      created: false,
    };
  }

  const createdDefendant =
    await createDefendant(record);

  return {
    defendant: createdDefendant,
    created: true,
  };
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
/**
 * Resolves all related database records for one trial.
 *
 * Missing defendants may be created when explicitly enabled.
 * Missing judges and offences remain unresolved.
 *
 * @param {Record<string, unknown>} record
 * @param {{ createMissingDefendants?: boolean }} options
 *
 * @returns {Promise<{
 *   defendant: object|null,
 *   judge: object|null,
 *   offence: object|null,
 *   defendantCreated: boolean,
 *   missingReferences: string[]
 * }>}
 */
export async function resolveTrialRelations(
  record,
  {
  createMissingDefendants = false,
  allowMissingDefendant = false,
  allowMissingJudge = false,
  allowMissingOffence = false,
} = {}
) {
  const [
  defendantResult,
  judge,
  offence,
] = await Promise.all([
  resolveDefendant(record, {
    createIfMissing: createMissingDefendants,
  }),

  record.judge_name
    ? findJudgeByName(record.judge_name)
    : Promise.resolve(null),

  record.offence
    ? findOffenceByName(record.offence)
    : Promise.resolve(null),
]);

  const missingReferences = [];

  if (
  !defendantResult.defendant &&
  !allowMissingDefendant
) {
  missingReferences.push(
    `Defendant not found: ${record.defendant_name}`
  );
}

  if (!judge && !allowMissingJudge) {
  missingReferences.push(
    `Judge not found: ${record.judge_name}`
  );
}

if (!offence && !allowMissingOffence) {
  missingReferences.push(
    `Offence not found: ${record.offence}`
  );
}

  return {
    defendant: defendantResult.defendant,
    judge,
    offence,
    defendantCreated: defendantResult.created,
    missingReferences,
  };
}