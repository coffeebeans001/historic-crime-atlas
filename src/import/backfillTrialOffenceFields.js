import { pool } from "../../db.js";

export async function backfillTrialOffenceFields(
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
          offence_category =
            COALESCE(offence_category, ?),
          offence_subcategory =
            COALESCE(offence_subcategory, ?)
        WHERE source_case_id = ?
      `,
      [
        record.offence_category ?? null,
        record.offence_subcategory ?? null,
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