import { transformOldBaileyRecord } from
  "../src/import/transformOldBaileyRecord.js";

import { validateOldBaileyApiRecord } from
  "../src/import/validateOldBaileyApiRecord.js"; 
  
import { summariseTransformation } from
  "../src/import/summariseTransformation.js";

import { summariseValidation } from
  "../src/import/summariseValidation.js";

import { createApiReviewRecords } from
  "../src/import/createApiReviewRecords.js";

import { writeApiReviewReport } from
  "../src/import/writeApiReviewReport.js";  


const searchTerm = process.argv[2] || "Sheffield";

const API_URL =
  `https://www.dhi.ac.uk/api/data/oldbailey_record?text=${encodeURIComponent(searchTerm)}`;

async function fetchOldBaileyRecords() {
  try {
    console.log(`\nSearching Old Bailey API for "${searchTerm}"...\n`);

    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    const totalResults = data?.hits?.total ?? 0;
    const records = data?.hits?.hits ?? [];

    console.log(`Total matching records: ${totalResults}`);
    console.log(`Records returned: ${records.length}\n`);

    if (records.length === 0) {
      console.log("No records found.");
      return;
    }

    console.log("========== RECORD SUMMARY ==========\n");

    records.forEach((record, index) => {

      const source = record._source || {};

      console.log(`Record ${index + 1}`);
      console.log("-----------------------------");
      console.log(`ID: ${source.idkey}`);
      console.log(`Title: ${source.title}`);
      console.log(`Image Count: ${source.images?.length ?? 0}`);

      const preview =
        source.text?.substring(0, 150).replace(/\s+/g, " ") + "...";

      console.log(`Preview: ${preview}`);
      console.log("");
    });

    console.log("===================================");

const transformedRecords = records.map((record) =>
  transformOldBaileyRecord(record)
);

const qualitySummary =
  summariseTransformation(transformedRecords);

const validationResults = transformedRecords.map(
  (record) => validateOldBaileyApiRecord(record)
);

const validationSummary =
  summariseValidation(validationResults);

const reviewedRecords = createApiReviewRecords({
  records,
  transformedRecords,
  validationResults,
});  

const readyForImport = reviewedRecords.filter(
  (record) => record.status === "READY"
).length;

const reviewRequired = reviewedRecords.filter(
  (record) => record.status === "REVIEW_REQUIRED"
).length;

console.log("\n========== TRANSFORMED RECORDS ==========\n");

transformedRecords.forEach((record, index) => {
  console.log(`Record ${index + 1}`);
  console.log("----------------------------------------");
  console.log(`Source ID: ${record.source_case_id}`);
  console.log(`Defendant: ${record.defendant_name}`);
  console.log(`Offence: ${record.offence}`);
  console.log(`Verdict: ${record.verdict ?? "Missing"}`);
  console.log(`Trial date: ${record.trial_date ?? "Missing"}`);
  console.log("");
});

console.log("\n========== OLD BAILEY API IMPORT REVIEW ==========\n");

transformedRecords.forEach((record, index) => {

    const source = records[index]._source;

    const transcriptLength =
        source.text?.length ?? 0;

    const transcriptTruncated =
        transcriptLength === 500;

    const missing = [];

    if (!record.defendant_name)
        missing.push("Defendant");

    if (!record.verdict)
        missing.push("Verdict");

    if (!record.trial_date)
        missing.push("Trial Date");

    const ready =
        missing.length === 0;

    console.log("----------------------------------------");

    console.log(`Record ${index + 1}`);

    console.log(`Status: ${
        ready
            ? "READY"
            : "REVIEW REQUIRED"
    }`);

    console.log("");

    console.log(`Source ID: ${record.source_case_id}`);

    console.log(`Title: ${source.title}`);

    console.log(`Defendant: ${
        record.defendant_name ?? "Missing"
    }`);

    console.log(`Offence: ${
        record.offence ?? "Missing"
    }`);

    console.log(`Verdict: ${
        record.verdict ?? "Missing"
    }`);

    console.log(`Trial date: ${
        record.trial_date ?? "Missing"
    }`);

    console.log(`Transcript length: ${transcriptLength}`);

    console.log(`Source URL: ${
        record.source_url
            ? "Present"
            : "Missing"
    }`);

    console.log(`Transcript truncated: ${
        transcriptTruncated
            ? "Yes"
            : "No"
    }`);

    console.log("");
});

console.log("==============================================");

console.log("\n========== API VALIDATION ==========\n");

validationResults.forEach((result, index) => {
  const record = transformedRecords[index];

  console.log(`Record ${index + 1}`);
  console.log("----------------------------------------");
  console.log(
    `Source ID: ${record.source_case_id ?? "Missing"}`
  );
  console.log(`Status: ${result.status}`);

  if (result.errors.length > 0) {
    console.log("Errors:");

    result.errors.forEach((error) => {
      console.log(`  - ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");

    result.warnings.forEach((warning) => {
      console.log(`  - ${warning}`);
    });
  }

  console.log("");
});

console.log("========== VALIDATION SUMMARY ==========\n");
console.log(`Valid: ${validationSummary.valid}`);
console.log(
  `Valid with warnings: ${validationSummary.validWithWarnings}`
);
console.log(`Invalid: ${validationSummary.invalid}`);
console.log(`Total errors: ${validationSummary.totalErrors}`);
console.log(`Total warnings: ${validationSummary.totalWarnings}`);
console.log("\n========================================");

console.log("\n========== IMPORT SUMMARY ==========\n");

console.log(`Records returned: ${records.length}`);
console.log(`Records transformed: ${transformedRecords.length}`);

console.log(`Ready for import: ${readyForImport}`);
console.log(`Needs review: ${reviewRequired}`);

console.log(`Missing defendant: ${qualitySummary.missingDefendantName}`);
console.log(`Missing verdict: ${qualitySummary.missingVerdict}`);
console.log(`Missing trial date: ${qualitySummary.missingTrialDate}`);

console.log("\n====================================");

const reportPath = await writeApiReviewReport({
  query: searchTerm,
  records,
  transformedRecords,
  qualitySummary,
  validationSummary,
  reviewedRecords,
});

console.log("\nAPI review report created:");
console.log(reportPath);

  } catch (error) {
    console.error(error.message);
  }
}

console.log("\n============================================");

fetchOldBaileyRecords();