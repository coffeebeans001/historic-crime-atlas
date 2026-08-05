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

console.log("\n========== RECORDS NEEDING REVIEW ==========\n");

transformedRecords.forEach((record, index) => {
  const missingFields = [];

  if (!record.verdict) {
    missingFields.push("verdict");
  }

  if (!record.trial_date) {
    missingFields.push("trial date");
  }

  if (missingFields.length === 0) {
    return;
  }

  const originalRecord = records[index];
  const source = originalRecord?._source || {};

  const textPreview = source.text
    ? source.text.replace(/\s+/g, " ").slice(-350)
    : "No transcript text";

  console.log(`Record ${index + 1}`);
  console.log("----------------------------------------");
  console.log(`Missing: ${missingFields.join(", ")}`);
  console.log(`Source ID: ${source.idkey ?? "Missing"}`);
  console.log(`Original title: ${source.title ?? "Missing"}`);
  console.log(`Transcript length: ${source.text?.length ?? 0}`);
  console.log(`Transcript appears truncated: ${source.text && !/[.!?]["']?$/.test(source.text.trim()) ? "Possibly" : "No"}`
);
  console.log(`Transcript ending: ${textPreview}`);
  console.log("");
});

console.log("============================================");



  } catch (error) {
    console.error(error.message);
  }
}

console.log("\n============================================");

fetchOldBaileyRecords();