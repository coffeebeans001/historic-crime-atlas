import path from "path";

import { pool } from "../../db.js";

/**
 * Creates an import-history record before a real import begins.
 *
 * @param {{
 *   sourceFile: string,
 *   rowsRead: number,
 *   rowsInvalid: number,
 *   rowsDuplicate: number
 * }} options
 *
 * @returns {Promise<number>}
 */
export async function createImportHistory({
  sourceFile,
  rowsRead,
  rowsInvalid,
  rowsDuplicate,
}) {
  const fileName = path.basename(sourceFile);

  const [result] = await pool.execute(
    `
      INSERT INTO data_imports (
        file_name,
        import_started_at,
        import_status,
        rows_read,
        rows_invalid,
        rows_duplicate,
        rows_inserted,
        rows_failed,
        dry_run
      )
      VALUES (
        ?,
        UTC_TIMESTAMP(),
        'RUNNING',
        ?,
        ?,
        ?,
        0,
        0,
        FALSE
      )
    `,
    [
      fileName,
      rowsRead,
      rowsInvalid,
      rowsDuplicate,
    ]
  );

  return result.insertId;
}

/**
 * Finalises an import-history record.
 *
 * @param {{
 *   importId: number,
 *   rowsInserted: number,
 *   rowsDuplicate: number,
 *   rowsFailed: number
 * }} options
 *
 * @returns {Promise<void>}
 */
export async function completeImportHistory({
  importId,
  rowsInserted,
  rowsDuplicate,
  rowsFailed,
}) {
  const importStatus =
    rowsFailed > 0
      ? "COMPLETED_WITH_ERRORS"
      : "COMPLETED";

  await pool.execute(
    `
      UPDATE data_imports
      SET
        import_completed_at = UTC_TIMESTAMP(),
        import_status = ?,
        rows_inserted = ?,
        rows_duplicate = ?,
        rows_failed = ?
      WHERE import_id = ?
    `,
    [
      importStatus,
      rowsInserted,
      rowsDuplicate,
      rowsFailed,
      importId,
    ]
  );
}

/**
 * Marks an import as failed when the overall process cannot finish.
 *
 * @param {{
 *   importId: number,
 *   rowsFailed?: number
 * }} options
 *
 * @returns {Promise<void>}
 */
export async function failImportHistory({
  importId,
  rowsFailed = 1,
}) {
  await pool.execute(
    `
      UPDATE data_imports
      SET
        import_completed_at = UTC_TIMESTAMP(),
        import_status = 'FAILED',
        rows_failed = ?
      WHERE import_id = ?
    `,
    [
      rowsFailed,
      importId,
    ]
  );
}