import path from "path";
import { fileURLToPath } from "url";

import { readCsvFile } from "../src/import/csvReader.js";
import { transformRecords } from "../src/import/transformer.js";
import { validateRecords } from "../src/import/validator.js";

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

console.log(`Rows read: ${rawRecords.length}`);
console.log(`Rows transformed: ${transformedRecords.length}`);
console.log(`Valid rows: ${validation.validRecords.length}`);
console.log(`Invalid rows: ${validation.invalidRecords.length}`);
console.log("");

validation.results.forEach((result) => {
  const status = result.isValid ? "VALID" : "INVALID";

  console.log(`Row ${result.rowNumber}: ${status}`);
  console.log(
    `Source case ID: ${result.record.source_case_id ?? "Missing"}`
  );

  if (!result.isValid) {
    result.errors.forEach((error) => {
      console.log(`- ${error}`);
    });
  }

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