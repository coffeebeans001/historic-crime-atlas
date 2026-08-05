import { transformOldBaileyRecord } from
  "../src/import/transformOldBaileyRecord.js";

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

console.log("\n========== IMPORT SUMMARY ==========\n");

console.log(`Records returned: ${records.length}`);
console.log(`Records transformed: ${transformedRecords.length}`);

console.log(`Ready for import: ${readyForImport}`);
console.log(`Needs review: ${reviewRequired}`);

console.log(`Missing defendant: ${qualitySummary.missingDefendantName}`);
console.log(`Missing verdict: ${qualitySummary.missingVerdict}`);
console.log(`Missing trial date: ${qualitySummary.missingTrialDate}`);

console.log("\n====================================");



  } catch (error) {
    console.error(error.message);
  }
}

console.log("\n============================================");

fetchOldBaileyRecords();