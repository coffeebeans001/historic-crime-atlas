import path from "path";
import { fileURLToPath } from "url";

import { readCsvFile } from "../src/import/csvReader.js";
import { transformRecords } from "../src/import/transformer.js";

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

console.log(`Rows read: ${rawRecords.length}`);
console.log(`Rows transformed: ${transformedRecords.length}`);
console.log("");

transformedRecords.forEach((record, index) => {
      console.log(`Row ${index + 1}`);
      console.log(record);
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