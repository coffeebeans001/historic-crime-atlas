import fs from "node:fs/promises";
import path from "node:path";

import { transformOldBaileyRecord } from
  "../src/import/transformOldBaileyRecord.js";

import { validateOldBaileyApiRecord } from
  "../src/import/validateOldBaileyApiRecord.js";  

function createFileTimestamp() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
}

async function writeApiReviewReport({
  query,
  records,
  transformedRecords,
  qualitySummary,
  validationResults,
  validationSummary,
  readyForImport,
  reviewRequired,
}) {
  const generatedAt = new Date().toISOString();
  const fileTimestamp = createFileTimestamp();

  const reportDirectory = path.resolve(
    "data",
    "import-reports"
  );

  await fs.mkdir(reportDirectory, {
    recursive: true,
  });

  const reviewedRecords = transformedRecords.map(
    (record, index) => {
      const source = records[index]?._source ?? {};
      const transcriptLength = source.text?.length ?? 0;
      const validation = validationResults[index];

      const missingFields = [];

      if (!record.source_case_id) {
        missingFields.push("source_case_id");
      }

      if (!record.defendant_name) {
        missingFields.push("defendant_name");
      }

      if (!record.offence) {
        missingFields.push("offence");
      }

      if (!record.verdict) {
        missingFields.push("verdict");
      }

      if (!record.trial_date) {
        missingFields.push("trial_date");
      }

      if (!record.source_url) {
        missingFields.push("source_url");
      }

      return {
        recordNumber: index + 1,
        status:
          missingFields.length === 0
            ? "READY"
            : "REVIEW_REQUIRED",
        missingFields,
        validation: {
          status: validation.status,
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
        transcriptLength,
        transcriptPossiblyTruncated:
          transcriptLength === 500,
        transformedRecord: record,
        originalSource: {
          idkey: source.idkey ?? null,
          title: source.title ?? null,
          images: source.images ?? [],
          text: source.text ?? null,
        },
      };
    }
  );

  const report = {
    reportType: "Old Bailey API Import Review",
    reportVersion: "1.2",
    generatedAt,
    query,
    summary: {
      recordsReturned: records.length,
      recordsTransformed: transformedRecords.length,
      readyForImport,
      needsReview: reviewRequired,
      missingSourceCaseId:
        qualitySummary.missingSourceCaseId,
      missingDefendantName:
        qualitySummary.missingDefendantName,
      missingOffence:
        qualitySummary.missingOffence,
      missingVerdict:
        qualitySummary.missingVerdict,
      missingTrialDate:
        qualitySummary.missingTrialDate,
      missingSourceUrl:
        qualitySummary.missingSourceUrl,
      validation: validationSummary,  
    },
    records: reviewedRecords,
  };

  const reportFileName =
    `api-import-review-${query}-${fileTimestamp}.json`;

  const safeReportFileName = reportFileName.replace(
    /[^a-zA-Z0-9._-]/g,
    "-"
  );

  const reportPath = path.join(
    reportDirectory,
    safeReportFileName
  );

  await fs.writeFile(
    reportPath,
    JSON.stringify(report, null, 2),
    "utf8"
  );

  return reportPath;
}

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

const validationResults = transformedRecords.map(
  (record) => validateOldBaileyApiRecord(record)
);

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

const qualitySummary = transformedRecords.reduce(
  (summary, record) => {
    if (!record.source_case_id) {
      summary.missingSourceCaseId += 1;
    }

    if (!record.defendant_name) {
      summary.missingDefendantName += 1;
    }

    if (!record.offence) {
      summary.missingOffence += 1;
    }

    if (!record.verdict) {
      summary.missingVerdict += 1;
    }

    if (!record.trial_date) {
      summary.missingTrialDate += 1;
    }

    if (!record.source_url) {
      summary.missingSourceUrl += 1;
    }

    return summary;
  },
  {
    totalTransformed: transformedRecords.length,
    missingSourceCaseId: 0,
    missingDefendantName: 0,
    missingOffence: 0,
    missingVerdict: 0,
    missingTrialDate: 0,
    missingSourceUrl: 0,
  }
);

console.log("========== TRANSFORMATION QUALITY ==========\n");
console.log(`Records transformed: ${qualitySummary.totalTransformed}`);
console.log(
  `Missing source case ID: ${qualitySummary.missingSourceCaseId}`
);
console.log(
  `Missing defendant name: ${qualitySummary.missingDefendantName}`
);
console.log(`Missing offence: ${qualitySummary.missingOffence}`);
console.log(`Missing verdict: ${qualitySummary.missingVerdict}`);
console.log(`Missing trial date: ${qualitySummary.missingTrialDate}`);
console.log(`Missing source URL: ${qualitySummary.missingSourceUrl}`);

console.log("\n========== OLD BAILEY API IMPORT REVIEW ==========\n");

let readyForImport = 0;
let reviewRequired = 0;

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

    if (ready)
        readyForImport++;
    else
        reviewRequired++;

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

const validationSummary = validationResults.reduce(
  (summary, result) => {
    if (result.status === "VALID") {
      summary.valid += 1;
    }

    if (result.status === "VALID_WITH_WARNINGS") {
      summary.validWithWarnings += 1;
    }

    if (result.status === "INVALID") {
      summary.invalid += 1;
    }

    summary.totalErrors += result.errors.length;
    summary.totalWarnings += result.warnings.length;

    return summary;
  },
  {
    valid: 0,
    validWithWarnings: 0,
    invalid: 0,
    totalErrors: 0,
    totalWarnings: 0,
  }
);

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
  validationResults,
  validationSummary,
  readyForImport,
  reviewRequired,
});

console.log("\nAPI review report created:");
console.log(reportPath);

  } catch (error) {
    console.error(error.message);
  }
}

console.log("\n============================================");

fetchOldBaileyRecords();