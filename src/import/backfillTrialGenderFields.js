import { pool } from "../../db.js";

export async function backfillTrialGenderFields(
  records
) {
  let changedRows = 0;

  for (const item of records) {
    const record = item.record ?? item;

    if (!record?.source_case_id) {
      continue;
    }

    const [result] = await pool.execute(
      `
        UPDATE trials
        SET
          defendant_gender =
            COALESCE(defendant_gender, ?)
        WHERE source_case_id = ?
      `,
      [
        record.defendant_gender ?? null,
        record.source_case_id,
      ]
    );

    changedRows += result.changedRows;
  }

  return {
    checked: records.length,
    changedRows,
  };
}