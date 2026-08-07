import { parseOldBaileyXml } from "../src/import/parseOldBaileyXml.js";

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

import { fetchOldBaileyRecordById } from
  "../src/import/fetchOldBaileyRecordById.js";  

const DEFAULT_QUERY = "robbery";
const DEFAULT_BATCH_SIZE = 10;

const args = process.argv.slice(2);

function getArgumentValue(argumentName, fallbackValue) {
  const argumentPrefix = `--${argumentName}=`;

  const matchingArgument = args.find((argument) =>
    argument.startsWith(argumentPrefix)
  );

  if (!matchingArgument) {
    return fallbackValue;
  }

  const value = matchingArgument.slice(argumentPrefix.length).trim();

  return value || fallbackValue;
}

const query = getArgumentValue("query", DEFAULT_QUERY);

const requestedBatchSize = Number.parseInt(
  getArgumentValue("size", String(DEFAULT_BATCH_SIZE)),
  10
);

const batchSize =
  Number.isInteger(requestedBatchSize) && requestedBatchSize > 0
    ? requestedBatchSize
    : DEFAULT_BATCH_SIZE;  

const apiUrl =
  `https://www.dhi.ac.uk/api/data/oldbailey_record` +
  `?text=${encodeURIComponent(query)}`;

async function fetchOldBaileyRecords() {
  try {
    console.log(`\nSearching Old Bailey API for "${query}"...\n`);

    
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log("Hits metadata:", {
      total: data.hits?.total,
      maxScore: data.hits?.max_score,
      returned: data.hits?.hits?.length,
    });

    const totalResults = data?.hits?.total ?? 0;
    const apiRecords = data.hits?.hits ?? [];
    const records = apiRecords.slice(0, batchSize);
    
      if (records.length === 0) {
      console.log("No records selected for processing.");
      return;
    }

    const firstRecordId = records[0]?._source?.idkey;

      if (!firstRecordId) {
      throw new Error("The first selected record does not contain an idkey.");
    }

    console.log("========== SINGLE RECORD TEST ==========");
    console.log(`Requesting record: ${firstRecordId}`);

    const singleRecordResult =
      await fetchOldBaileyRecordById(firstRecordId);

    console.log(`Requested ID: ${singleRecordResult.requestedId}`);
    console.log(`Matching records: ${singleRecordResult.totalResults}`);
    console.log(
      `Records returned: ${singleRecordResult.records.length}`
    );
    const singleRecord = singleRecordResult.records[0];

    console.log(
      "Single-record source keys:",
      Object.keys(singleRecord?._source ?? {})
    );

    const singleSource = singleRecord?._source ?? {};

    console.log("\n========== METADATA INSPECTION ==========");

    console.log("Metadata type:", typeof singleSource.metadata);

    console.log(
      "Metadata keys:",
      singleSource.metadata &&
      typeof singleSource.metadata === "object"
        ? Object.keys(singleSource.metadata)
        : []
    );

    console.dir(singleSource.metadata, {
      depth: 4,
      maxArrayLength: 20,
    });

    console.log("\n========== XML INSPECTION ==========");

    const xml = singleSource.xml ?? "";

    const {
  defendantMatches,
  verdictMatches,
  punishmentMatches,
  defendantName,
  defendantGender,
  verdictCategory,
  verdictSubcategory,
  plea,
  verdictText,
  punishment
} = parseOldBaileyXml(xml);

    console.log("\nDefendant parser module test:");
    console.log("Defendant name:", defendantName);
    console.log("Defendant gender:", defendantGender);

    console.log("XML type:", typeof xml);
    console.log("XML length:", xml.length);

    console.log("\nXML preview:");
    console.log(xml.slice(0, 2000));

    console.log(`Total matching records: ${totalResults}`);
    console.log(`Records returned by API: ${apiRecords.length}`);
    console.log(`Records selected for processing: ${records.length}\n`);

    console.log("\n========== TARGETED XML INSPECTION ==========");

    console.log("\nDefendant nodes:");
    console.log(defendantMatches.length > 0 ? defendantMatches : "None found");

    console.log("\nVerdict nodes:");
    console.log(verdictMatches.length > 0 ? verdictMatches : "None found");

    console.log("\nPunishment / sentence nodes:");
    console.log(
      punishmentMatches.length > 0
        ? punishmentMatches
        : "None found"
    );

    console.log("============================================\n");

    console.log("\n========== XML PARSER ==========");
    
    console.log("Defendant name from XML:", defendantName);
    console.log("Defendant gender from XML:", defendantGender);
    console.log("Verdict category from XML:", verdictCategory);
    console.log("Verdict subcategory from XML:", verdictSubcategory);
    console.log("Plea from XML:", plea);
    console.log("Verdict text from XML:", verdictText);
    console.log("Punishment / sentence from XML:", punishment);

    const parsedXmlData = {
      defendantName,
      defendantGender,
      verdictCategory,
      verdictSubcategory,
      plea,
      verdictText,
      punishment
    };

    console.log("\nParsed XML data:");
    console.log(parsedXmlData);

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
  query: query,
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