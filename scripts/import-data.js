import path from "path";
import { fileURLToPath } from "url";

import { readCsvFile } from "../src/import/csvReader.js";
import { transformRecords } from "../src/import/transformer.js";
import { validateRecords } from "../src/import/validator.js";
import { detectDuplicates } from "../src/import/duplicateChecker.js";
import { detectDatabaseDuplicates } from "../src/import/databaseDuplicateChecker.js";
import { resolveTrialRelations } from "../src/import/relationResolver.js";
import { importResolvedTrials } from "../src/import/trialImporter.js";
import { writeImportReports } from "../src/import/reportWriter.js";
import {
  createImportHistory,
  completeImportHistory,
  failImportHistory,
} from "../src/import/importHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const insertTrials = process.argv.includes("--insert-trials");

const createMissingDefendants = insertTrials || process.argv.includes("--create-missing-defendants");

async function runImport() {
  const csvFilePath = path.join(
    __dirname,
    "..",
    "data",
    "imports",
    "old-bailey-sample.csv"
  );

  const reportDirectory = path.join(
  __dirname,
  "..",
  "data",
  "import-reports"
);

  console.log("Old Bailey CSV Import");
  console.log("---------------------");
  console.log(`Reading: ${csvFilePath}`);

console.log(
  `Create missing defendants: ${
    createMissingDefendants ? "YES" : "NO"
  }`
);

console.log(
  `Insert trials: ${
    insertTrials ? "YES" : "NO"
  }`
);

console.log("");

let importId = null;

  try {
const rawRecords = await readCsvFile(csvFilePath);
const transformedRecords = transformRecords(rawRecords);
const validation = validateRecords(transformedRecords);
const duplicateCheck = detectDuplicates(validation.results);
const databaseDuplicateCheck = await detectDatabaseDuplicates(duplicateCheck.uniqueRecords);

if (insertTrials) {
  importId = await createImportHistory({
    sourceFile: csvFilePath,
    rowsRead: rawRecords.length,
    rowsInvalid:
      validation.invalidRecords.length,
    rowsDuplicate:
      duplicateCheck.duplicateRecords.length +
      databaseDuplicateCheck
        .databaseDuplicates.length,
  });
}

const relationResults = [];

for (
  const item of
    databaseDuplicateCheck.readyRecords
) { 
  const relations = await resolveTrialRelations(
  item.record,
  {
    createMissingDefendants,
    allowMissingJudge: true,
    allowMissingOffence: true,
  }
);

  relationResults.push({
    rowNumber: item.rowNumber,
    record: item.record,
    ...relations,
  });
}

let trialImportResults = [];

if (insertTrials) {
  trialImportResults =
    await importResolvedTrials(
      relationResults,
      { importId }
    );
}

const resolvedRows = relationResults.filter(
  (result) => result.missingReferences.length === 0
);

const unresolvedRows = relationResults.filter(
  (result) => result.missingReferences.length > 0
);

const createdDefendants =
  relationResults.filter(
    (result) => result.defendantCreated
  );

const insertedTrials =
  trialImportResults.filter(
    (result) =>
      result.status === "INSERTED"
  );

const transactionDuplicates =
  trialImportResults.filter(
    (result) =>
      result.status ===
      "DATABASE_DUPLICATE"
  );

const failedTrials =
  trialImportResults.filter(
    (result) =>
      result.status === "FAILED"
  );

const unresolvedTrialImports =
  trialImportResults.filter(
    (result) =>
      result.status === "UNRESOLVED"
  );  

const reportFiles =
  await writeImportReports({
    reportDirectory,
    sourceFile: csvFilePath,
    rawRecords,
    transformedRecords,
    validation,
    duplicateCheck,
    dryRun: !createMissingDefendants,
    databaseChanges:
    createdDefendants.length +
    insertedTrials.length,
  });  

  databaseDuplicateCheck.databaseDuplicates.forEach(
  (item) => {
    console.log(
      `Database duplicate check — Row ${item.rowNumber}`
    );

    console.log("Status: DATABASE_DUPLICATE");

    console.log(
      `Source case ID: ${
        item.record.source_case_id
      }`
    );

    console.log(
      `- Existing trial ID: ${
        item.existingTrial.id
      }`
    );

    console.log("");
  }
);

databaseDuplicateCheck.readyRecords.forEach(
  (item) => {
    console.log(
      `Database duplicate check — Row ${item.rowNumber}`
    );

    console.log("Status: READY_FOR_INSERT");

    console.log(
      `Source case ID: ${
        item.record.source_case_id
      }`
    );

    console.log("");
  }
);

relationResults.forEach((result) => {
  console.log(`Database relationship check — Row ${result.rowNumber}`);

   if (result.missingReferences.length > 0) {
    console.log("Status: UNRESOLVED");

    result.missingReferences.forEach((message) => {
      console.log(`- ${message}`);
    });

    console.log("");
    return;
  }

  console.log("Status: RESOLVED");

   if (result.defendantCreated) {
  console.log(`- Defendant created: ${result.defendant.defendant_name}`);
}
  console.log(`- defendant_id: ${result.defendant.defendant_id}`);
  console.log(`- judge_id: ${result.judge.judge_id}`);
  console.log(`- offence_id: ${result.offence.offence_id}`);
  console.log("");
});

console.log(`Rows read: ${rawRecords.length}`);
console.log(`Rows transformed: ${transformedRecords.length}`);
console.log(`Unique valid rows: ${duplicateCheck.uniqueRecords.length}`);
console.log(`Invalid rows: ${validation.invalidRecords.length}`);
console.log(`CSV duplicate rows: ${duplicateCheck.duplicateRecords.length}`);
console.log(`Database duplicates: ${databaseDuplicateCheck.databaseDuplicates.length}`);
console.log(`Ready for insertion: ${databaseDuplicateCheck.readyRecords.length}`);
console.log("");

console.log(`Resolved database rows: ${resolvedRows.length}`);
console.log(`Unresolved database rows: ${unresolvedRows.length}`);
console.log(`Defendants created: ${createdDefendants.length}`);
console.log(`Trials inserted: ${insertedTrials.length}`);
console.log(`Transaction duplicates: ${transactionDuplicates.length}`);
console.log(`Unresolved trial imports: ${unresolvedTrialImports.length}`);
console.log(`Failed trial imports: ${failedTrials.length}`);
console.log("");

if (importId !== null) {
  console.log(`Import history ID: ${importId}`);
}

if (insertTrials && importId !== null) {
  await completeImportHistory({
    importId,
    rowsInserted:
      insertedTrials.length,
    rowsDuplicate:
      duplicateCheck.duplicateRecords.length +
      databaseDuplicateCheck
        .databaseDuplicates.length +
      transactionDuplicates.length,
    rowsFailed:
      failedTrials.length +
      unresolvedTrialImports.length,
  });
}

trialImportResults.forEach((result) => {
  console.log(
    `Trial import — Row ${result.rowNumber}`
  );

  console.log(`Status: ${result.status}`);

  console.log(
    `Source case ID: ${
      result.record.source_case_id
    }`
  );

  if (result.status === "INSERTED") {
    console.log(
      `- New trial ID: ${result.trialId}`
    );
  }

  if (
    result.status ===
      "DATABASE_DUPLICATE" &&
    result.existingTrialId
  ) {
    console.log(
      `- Existing trial ID: ${
        result.existingTrialId
      }`
    );
  }

  if (result.errors?.length > 0) {
    result.errors.forEach((error) => {
      console.log(`- ${error}`);
    });
  }

  console.log("");
});

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
    console.log(`- Duplicate of row ${duplicate.duplicateOfRow}.`);
    console.log("");
    return;
  }

  console.log("Status: VALID");
  console.log(`Source case ID: ${result.record.source_case_id}`);
  console.log("");
});
    if (insertTrials) {
  console.log("Import completed.");
} else {
  console.log("Import preview completed.");
}

console.log(
  `Database changes: ${
    createdDefendants.length +
    insertedTrials.length
  }`
);
    console.log("");
    console.log("Reports generated:");
    console.log(`- Summary: ${reportFiles.summaryPath}`);
    console.log(`- Rejected rows: ${reportFiles.rejectedRowsPath}`);
    console.log(`- Duplicate rows: ${reportFiles.duplicateRowsPath}`);
  } catch (error) {
  if (insertTrials && importId !== null) {
    try {
      await failImportHistory({
        importId,
      });
    } catch (historyError) {
      console.error(
        "Could not mark import history as failed."
      );
      console.error(historyError.message);
    }
  }

  console.error("Import failed.");
  console.error(error.message);
  process.exitCode = 1;
}
}

runImport();