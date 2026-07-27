import fs from "fs/promises";
import path from "path";

/**
 * Creates a filename-safe UTC timestamp.
 *
 * Example:
 * 2026-07-27T21-45-30-123Z
 *
 * @returns {string}
 */
function createFileTimestamp() {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(".", "-");
}

/**
 * Escapes one value so it can be written safely into a CSV file.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

/**
 * Converts an array of objects into CSV text.
 *
 * @param {Record<string, unknown>[]} rows
 * @param {string[]} columns
 * @returns {string}
 */
function convertRowsToCsv(rows, columns) {
  const header = columns
    .map(escapeCsvValue)
    .join(",");

  const dataRows = rows.map((row) =>
    columns
      .map((column) => escapeCsvValue(row[column]))
      .join(",")
  );

  return [header, ...dataRows].join("\n");
}

/**
 * Writes the import summary and review files.
 *
 * @param {{
 *   reportDirectory: string,
 *   sourceFile: string,
 *   rawRecords: Record<string, unknown>[],
 *   transformedRecords: Record<string, unknown>[],
 *   validation: {
 *     invalidRecords: Array<{
 *       rowNumber: number,
 *       record: Record<string, unknown>,
 *       errors: string[]
 *     }>
 *   },
 *   duplicateCheck: {
 *     uniqueRecords: Array<{
 *       rowNumber: number,
 *       record: Record<string, unknown>
 *     }>,
 *     duplicateRecords: Array<{
 *       rowNumber: number,
 *       record: Record<string, unknown>,
 *       duplicateOfRow: number,
 *       duplicateKey: string
 *     }>
 *   },
 *   dryRun?: boolean
 * }} options
 *
 * @returns {Promise<{
 *   summaryPath: string,
 *   rejectedRowsPath: string,
 *   duplicateRowsPath: string
 * }>}
 */
export async function writeImportReports({
  reportDirectory,
  sourceFile,
  rawRecords,
  transformedRecords,
  validation,
  duplicateCheck,
  dryRun = true,
}) {
  const resolvedReportDirectory =
    path.resolve(reportDirectory);

  await fs.mkdir(resolvedReportDirectory, {
    recursive: true,
  });

  const timestamp = createFileTimestamp();
  const generatedAt = new Date().toISOString();

  const summaryPath = path.join(
    resolvedReportDirectory,
    `import-summary-${timestamp}.json`
  );

  const rejectedRowsPath = path.join(
    resolvedReportDirectory,
    `rejected-rows-${timestamp}.csv`
  );

  const duplicateRowsPath = path.join(
    resolvedReportDirectory,
    `duplicate-rows-${timestamp}.csv`
  );

  const summary = {
    sourceFile: path.resolve(sourceFile),
    generatedAt,
    dryRun,
    rowsRead: rawRecords.length,
    rowsTransformed: transformedRecords.length,
    uniqueValidRows:
      duplicateCheck.uniqueRecords.length,
    invalidRows: validation.invalidRecords.length,
    duplicateRows:
      duplicateCheck.duplicateRecords.length,
    databaseChanges: 0,
  };

  const rejectedRows =
    validation.invalidRecords.map((item) => ({
      row_number: item.rowNumber,
      source_case_id:
        item.record.source_case_id ?? "",
      trial_date: item.record.trial_date ?? "",
      defendant_name:
        item.record.defendant_name ?? "",
      offence: item.record.offence ?? "",
      errors: item.errors.join(" | "),
    }));

  const duplicateRows =
    duplicateCheck.duplicateRecords.map((item) => ({
      row_number: item.rowNumber,
      source_case_id:
        item.record.source_case_id ?? "",
      duplicate_of_row: item.duplicateOfRow,
      duplicate_key: item.duplicateKey,
      trial_date: item.record.trial_date ?? "",
      defendant_name:
        item.record.defendant_name ?? "",
      offence: item.record.offence ?? "",
    }));

  const rejectedCsv = convertRowsToCsv(
    rejectedRows,
    [
      "row_number",
      "source_case_id",
      "trial_date",
      "defendant_name",
      "offence",
      "errors",
    ]
  );

  const duplicateCsv = convertRowsToCsv(
    duplicateRows,
    [
      "row_number",
      "source_case_id",
      "duplicate_of_row",
      "duplicate_key",
      "trial_date",
      "defendant_name",
      "offence",
    ]
  );

  await Promise.all([
    fs.writeFile(
      summaryPath,
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8"
    ),
    fs.writeFile(
      rejectedRowsPath,
      `${rejectedCsv}\n`,
      "utf8"
    ),
    fs.writeFile(
      duplicateRowsPath,
      `${duplicateCsv}\n`,
      "utf8"
    ),
  ]);

  return {
    summaryPath,
    rejectedRowsPath,
    duplicateRowsPath,
  };
}