import path from "path";
import { fileURLToPath } from "url";

import { readCsvFile } from "../src/import/csvReader.js";
import { transformRecords } from "../src/import/transformer.js";
import { validateRecords } from "../src/import/validator.js";
import { detectDuplicates } from "../src/import/duplicateChecker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runImport() {
  const csvFilePath = path.join(
    __dirname,
    "..",
    "data",
    "imports",
    "old-bailey-sample.csv"
  );

  console.log("Old Bailey CSV Import");
  console.log("---------------------");
  console.log(`Reading: ${csvFilePath}`);
  console.log("");

  try {
const rawRecords = await readCsvFile(csvFilePath);
const transformedRecords = transformRecords(rawRecords);
const validation = validateRecords(transformedRecords);
const duplicateCheck = detectDuplicates(validation.results);

console.log(`Rows read: ${rawRecords.length}`);
console.log(`Rows transformed: ${transformedRecords.length}`);
console.log(`Unique valid rows: ${duplicateCheck.uniqueRecords.length}`);
console.log(`Invalid rows: ${validation.invalidRecords.length}`);
console.log(`Duplicate rows: ${duplicateCheck.duplicateRecords.length}`);
console.log("");

validation.results.forEach((result) => {
  console.log(`Row ${result.rowNumber}`);

  if (!result.isValid) {
    console.log("Status: INVALID");
    console.log(
      `Source case ID: ${result.record.source_case_id ?? "Missing"}`
    );

    result.errors.forEach((error) => {
      console.log(`- ${error}`);
    });

    console.log("");
    return;
  }

  const duplicate = duplicateCheck.duplicateRecords.find(
    (duplicateRecord) =>
      duplicateRecord.rowNumber === result.rowNumber
  );

  if (duplicate) {
    console.log("Status: DUPLICATE");
    console.log(`Source case ID: ${duplicate.duplicateKey}`);
    console.log(
      `- Duplicate of row ${duplicate.duplicateOfRow}.`
    );
    console.log("");
    return;
  }

  console.log("Status: VALID");
  console.log(
    `Source case ID: ${result.record.source_case_id}`
  );
  console.log("");
});
    console.log("Import preview completed.");
    console.log("Database changes: 0");
  } catch (error) {
  console.error("Import failed.");
  console.error(error.message);
  process.exitCode = 1;
}
}

runImport();