import { pool } from "../../db.js";

export async function backfillTrialTextFields(
  relationResults
) {
  let changedRows = 0;

  for (const item of relationResults) {
    const record = item.record;

    if (!record?.source_case_id) {
      continue;
    }

   const [result] = await pool.execute(
  `
    UPDATE trials
    SET
      location_text = COALESCE(location_text, ?),
      transcript_text = COALESCE(transcript_text, ?)
    WHERE source_case_id = ?
  `,
  [
    record.location_text ?? null,
    record.transcript_text ?? null,
    record.source_case_id,
  ]
);

    changedRows += result.changedRows;
  }

  return {
    checked: relationResults.length,
    changedRows,
  };
}