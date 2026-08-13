import { enrichOldBaileyRecord } from "../src/import/enrichOldBaileyRecord.js";

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

import { detectDuplicates } from "../src/import/duplicateChecker.js";
import { detectDatabaseDuplicates } from "../src/import/databaseDuplicateChecker.js";  

const DEFAULT_QUERY = "robbery";
const DEFAULT_BATCH_SIZE = 10;

const MULTI_OFFENCE_MODE = true;

const MULTI_OFFENCE_QUERIES = [
  "robbery",
  "murder",
  "burglary",
  "poisoning",
];

const MULTI_OFFENCE_SIZE = 25;

const args = process.argv.slice(2);
const DEBUG_INSPECTION = false; // Set to true to enable detailed inspection logs

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

const pageSize = 10;

async function fetchOldBaileyRecords() {
  try {
    const allRecords = [];
    let totalResults = 0;

    const queriesToFetch = MULTI_OFFENCE_MODE
      ? MULTI_OFFENCE_QUERIES
      : [query];

    const recordsPerQuery = MULTI_OFFENCE_MODE
      ? MULTI_OFFENCE_SIZE
      : batchSize;

    for (const currentQuery of queriesToFetch) {
      console.log(
        `\nSearching Old Bailey API for "${currentQuery}"...\n`
      );

      const queryRecords = [];

      for (
        let from = 0;
        from < recordsPerQuery;
        from += pageSize
      ) {
        const pageUrl =
          `https://www.dhi.ac.uk/api/data/oldbailey_record` +
          `?text=${encodeURIComponent(currentQuery)}` +
          `&from=${from}`;

        const response = await fetch(pageUrl);

        if (!response.ok) {
          throw new Error(
            `Request failed: ${response.status} ${response.statusText}`
          );
        }

        const pageData = await response.json();

        if (from === 0) {
          const queryTotal =
            pageData.hits?.total ?? 0;

          totalResults += queryTotal;

          console.log("Hits metadata:", {
            query: currentQuery,
            total: queryTotal,
            maxScore: pageData.hits?.max_score,
            returned:
              pageData.hits?.hits?.length ?? 0,
          });
        }

        const pageRecords =
          pageData.hits?.hits ?? [];

        console.log(
          `Fetched page starting at ${from}: ${pageRecords.length} records`
        );

        queryRecords.push(...pageRecords);
      }

      const selectedQueryRecords =
        queryRecords.slice(0, recordsPerQuery);

      console.log(
        `Selected for "${currentQuery}": ${selectedQueryRecords.length}`
      );

      allRecords.push(...selectedQueryRecords);
    }

    const requestedRecordCount =
  MULTI_OFFENCE_MODE
    ? MULTI_OFFENCE_QUERIES.length *
      MULTI_OFFENCE_SIZE
    : batchSize;

const records =
  allRecords.slice(0, requestedRecordCount);

    console.log(
      `Records selected for processing: ${records.length}`
    );

    if (records.length === 0) {
      console.log("No records selected for processing.");
      return;
    }

    const nonTrialRecords = records.filter(isNonTrialRecord);

    const trialRecords = records.filter(
      (record) => !isNonTrialRecord(record)
    );

    console.log(`Non-trial records excluded: ${nonTrialRecords.length}`);

    console.log(`Trial records selected for processing: ${trialRecords.length}\n`);

    console.log("\n========== NON-TRIAL RECORDS ==========\n");

for (const record of nonTrialRecords) {
  console.log(
    record?._source?.idkey,
    "→",
    record?._source?.title
  );
}
   const firstRecordId = records[0]?._source?.idkey;
   //const firstRecordId = "t18440819-1920";


      if (!firstRecordId) {
      throw new Error("The first selected record does not contain an idkey.");
    }

    if (DEBUG_INSPECTION) {
  console.log("========== SINGLE RECORD TEST ==========");
  console.log(`Requesting record: ${firstRecordId}`);
}

const singleRecordResult =
  await fetchOldBaileyRecordById(firstRecordId);

if (DEBUG_INSPECTION) {
  console.log(`Requested ID: ${singleRecordResult.requestedId}`);
  console.log(`Matching records: ${singleRecordResult.totalResults}`);
  console.log(
    `Records returned: ${singleRecordResult.records.length}`
  );
}

const singleRecord = singleRecordResult.records[0];

    

    if (DEBUG_INSPECTION) {
  console.log("\n========== ENRICHMENT TEST ==========");
}

const enrichedRecord = await enrichOldBaileyRecord(
  singleRecord,
  fetchOldBaileyRecordById,
  parseOldBaileyXml
);

if (DEBUG_INSPECTION) {
  console.log(
    "Original ID:",
    enrichedRecord.originalRecord?._source?.idkey ?? null
  );

  console.log(
    "Detailed record found:",
    enrichedRecord.detailedRecord ? "Yes" : "No"
  );

  console.log(
    "Parsed defendant:",
    enrichedRecord.parsedXmlData?.defendantName ?? null
  );

  console.log(
    "Parsed verdict:",
    enrichedRecord.parsedXmlData?.verdictCategory ?? null
  );

  console.log(
    "Single-record source keys:",
    Object.keys(singleRecord?._source ?? {})
  );

  console.log("\n======================================\n");
}

const searchSource = records[0]?._source ?? {};

const singleSource = singleRecord?._source ?? {};

    if (DEBUG_INSPECTION) {
  console.log("\n========== TRANSCRIPT COMPARISON ==========");

  console.log(
    "Search transcript length:",
    searchSource.text?.length ?? 0
  );

  console.log(
    "Detailed transcript length:",
    singleSource.text?.length ?? 0
  );

  console.log(
    "Detailed transcript ending:"
  );

  console.log(
    singleSource.text?.slice(-500) ??
      "No detailed transcript available."
  );
}

    if (DEBUG_INSPECTION) {
  console.log("\n========== TRANSCRIPT CHECK ==========");

  console.log(
    "Text length:",
    singleSource.text?.length ?? 0
  );

  console.log(
    "HTML length:",
    singleSource.html?.length ?? 0
  );

  console.log(
    "XML length:",
    singleSource.xml?.length ?? 0
  );

}

    if (DEBUG_INSPECTION) {
  console.log("\n========== METADATA INSPECTION ==========");

  console.log(
    "Metadata type:",
    typeof singleSource.metadata
  );

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
}

    console.log("\n========== XML INSPECTION ==========");

    const xml = singleSource.xml ?? "";

    const {
  defendantMatches,
  verdictMatches,
  punishmentMatches,
  offenceMatches,
  defendantName,
  defendantGender,
  verdictCategory,
  verdictSubcategory,
  plea,
  verdictText,
  punishment,
  offenceCategory,
  offenceSubcategory,
  offenceText
} = parseOldBaileyXml(xml);

    if (DEBUG_INSPECTION) {
  console.log("\n========== XML INSPECTION ==========");

  console.log("\nDefendant parser module test:");
  console.log("Defendant name:", defendantName);
  console.log("Defendant gender:", defendantGender);

  console.log("XML type:", typeof xml);
  console.log("XML length:", xml.length);

  // console.log("\nXML preview:");
  // console.log(xml.slice(0, 2000));

  console.log(`Total matching records: ${totalResults}`);
  console.log(`Records fetched from API: ${allRecords.length}`);
  console.log(`Records selected for processing: ${records.length}\n`);
}

    if (DEBUG_INSPECTION) {
  console.log("\n========== TARGETED XML INSPECTION ==========");

  console.log("\nDefendant nodes:");
  console.log(
    defendantMatches.length > 0
      ? defendantMatches
      : "None found"
  );

  console.log("\nVerdict nodes:");
  console.log(
    verdictMatches.length > 0
      ? verdictMatches
      : "None found"
  );

  console.log("\nPunishment / sentence nodes:");
  console.log(
    punishmentMatches.length > 0
      ? punishmentMatches
      : "None found"
  );

  console.log("\nOffence nodes:");

  if (offenceMatches.length > 0) {
    console.log(offenceMatches);
  } else {
    console.log("None found");

    console.log("\nSearching XML for offence...");

    const offencePreview = xml.match(
      /.{0,200}offence.{0,200}/gi
    );

    console.log("\n========== OFFENCE XML SEARCH ==========");

    const offenceSearch =
      xml.match(/.{0,250}(?:offence|offense).{0,250}/gi) ?? [];

    console.log(
      offenceSearch.length > 0
        ? offenceSearch
        : "No offence/offense references found."
    );

    console.log(
      offencePreview ?? "No 'offence' text found."
    );
  }

  console.log("============================================\n");
}

   if (DEBUG_INSPECTION) {
  console.log("\n========== XML PARSER ==========");

  console.log("Defendant name from XML:", defendantName);
  console.log("Defendant gender from XML:", defendantGender);
  console.log("Verdict category from XML:", verdictCategory);
  console.log("Verdict subcategory from XML:", verdictSubcategory);
  console.log("Plea from XML:", plea);
  console.log("Verdict text from XML:", verdictText);
  console.log("Punishment / sentence from XML:", punishment);
  console.log("Offence category from XML:", offenceCategory);
  console.log("Offence subcategory from XML:", offenceSubcategory);
  console.log("Offence text from XML:", offenceText);
}

const parsedXmlData = {
  defendantName,
  defendantGender,
  verdictCategory,
  verdictSubcategory,
  plea,
  verdictText,
  punishment,
  offenceCategory,
  offenceSubcategory,
  offenceText
};

if (DEBUG_INSPECTION) {
  console.log("\nParsed XML data:");
  console.log(parsedXmlData);
}

    if (DEBUG_INSPECTION) {
  console.log("\n========== SMALL BATCH ENRICHMENT ==========");

  console.log(`Records selected: ${records.length}`);
  console.log(`Non-trial records excluded: ${nonTrialRecords.length}`);
  console.log(`Trial records to enrich: ${trialRecords.length}\n`);
}

const enrichedRecords = [];

for (const record of trialRecords) {
  const enrichedRecord = await enrichOldBaileyRecord(
    record,
    fetchOldBaileyRecordById,
    parseOldBaileyXml
  );

  enrichedRecords.push(enrichedRecord);
}

if (DEBUG_INSPECTION) {
  console.log("===================================");
}

const transformedRecords = enrichedRecords.map((enrichedRecord) => {
  const recordForTransform =
    enrichedRecord.detailedRecord ??
    enrichedRecord.originalRecord;

  return transformOldBaileyRecord(
    recordForTransform,
    enrichedRecord.parsedXmlData
  );
});

const qualitySummary =
  summariseTransformation(transformedRecords);

const validationResults = transformedRecords.map(
  (record) => validateOldBaileyApiRecord(record)
);

const validationSummary =
  summariseValidation(validationResults);

const reviewedRecords = createApiReviewRecords({
  records: trialRecords,
  transformedRecords,
  validationResults,
});

const apiReadyRecords = reviewedRecords
  .filter(
    (reviewRecord) =>
      reviewRecord.status === "READY" &&
      reviewRecord.validation.isValid
  )
  .map((reviewRecord) => ({
    isValid: true,
    rowNumber: reviewRecord.recordNumber,
    record: reviewRecord.transformedRecord,
  }));

const duplicateCheck =
  detectDuplicates(apiReadyRecords);

const databaseDuplicateCheck =
  await detectDatabaseDuplicates(
    duplicateCheck.uniqueRecords
  );  

const readyForImport = reviewedRecords.filter(
  (record) => record.status === "READY"
).length;

const reviewRequired = reviewedRecords.filter(
  (record) => record.status === "REVIEW_REQUIRED"
).length;

if (DEBUG_INSPECTION) {
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
    console.log(
      `Offence category: ${record.offence_category ?? "Missing"}`
    );
    console.log(
      `Offence subcategory: ${record.offence_subcategory ?? "Missing"}`
    );
    console.log(
      `Transformed transcript length: ${
        record.transcript_text?.length ?? 0
      }`
    );
  });
}

function formatCoverage(present, total) {
  const percentage =
    total === 0
      ? 0
      : ((present / total) * 100).toFixed(1);

  return `${present} / ${total} (${percentage}%)`;
}

const missingFieldRecords = transformedRecords
  .map((record) => {
    const missingFields = [];

    if (!record.defendant_name) {
      missingFields.push("defendant_name");
    }

    if (!record.defendant_gender) {
      missingFields.push("defendant_gender");
    }

    if (!record.offence_category) {
      missingFields.push("offence_category");
    }

    if (!record.offence_subcategory) {
      missingFields.push("offence_subcategory");
    }

    if (!record.verdict_category) {
      missingFields.push("verdict_category");
    }

    if (!record.verdict_subcategory) {
      missingFields.push("verdict_subcategory");
    }

    if (!record.plea) {
      missingFields.push("plea");
    }

    if (!record.punishment) {
      missingFields.push("punishment");
    }

    return {
      source_case_id: record.source_case_id,
      missingFields,
    };
  })
  .filter((record) => record.missingFields.length > 0);

  console.log("\n========== XML MISSING FIELD REVIEW ==========\n");

for (const record of missingFieldRecords) {
  console.log(
    `${record.source_case_id} → ${record.missingFields.join(", ")}`
  );
}

console.log("\n========== XML INSPECTION SUMMARY ==========\n");

const xmlInspectionSummary = transformedRecords.reduce(
  (summary, record) => {
    summary.recordsInspected += 1;

    if (record.defendant_name) {
      summary.defendantNamePresent += 1;
    }

    if (record.defendant_gender) {
      summary.defendantGenderPresent += 1;
    }

    if (record.offence_category) {
      summary.offenceCategoryPresent += 1;
    }

    if (record.offence_subcategory) {
      summary.offenceSubcategoryPresent += 1;
    }

    if (record.verdict_category) {
      summary.verdictCategoryPresent += 1;
    }

    if (record.verdict_subcategory) {
      summary.verdictSubcategoryPresent += 1;
    }

    if (record.plea) {
      summary.pleaPresent += 1;
    }

    if (record.punishment) {
      summary.punishmentPresent += 1;
    }

    return summary;
  },
  {
    recordsInspected: 0,
    defendantNamePresent: 0,
    defendantGenderPresent: 0,
    offenceCategoryPresent: 0,
    offenceSubcategoryPresent: 0,
    verdictCategoryPresent: 0,
    verdictSubcategoryPresent: 0,
    pleaPresent: 0,
    punishmentPresent: 0,
  }
);

console.log(`Records selected: ${records.length}`);
console.log(`Non-trial records excluded: ${nonTrialRecords.length}`);
console.log(`Trial records inspected: ${xmlInspectionSummary.recordsInspected}`);
console.log("");

console.log(
  `Defendant name: ${formatCoverage(
    xmlInspectionSummary.defendantNamePresent,
    xmlInspectionSummary.recordsInspected
  )}`
);
console.log(
  `Defendant gender: ${formatCoverage(
    xmlInspectionSummary.defendantGenderPresent,
    xmlInspectionSummary.recordsInspected
  )}`
);

console.log(
  `Offence category: ${formatCoverage(
    xmlInspectionSummary.offenceCategoryPresent,
    xmlInspectionSummary.recordsInspected
  )}`
);

console.log(
  `Offence subcategory: ${formatCoverage(
    xmlInspectionSummary.offenceSubcategoryPresent,
    xmlInspectionSummary.recordsInspected
  )}`
);

console.log(
  `Verdict category: ${formatCoverage(
    xmlInspectionSummary.verdictCategoryPresent,
    xmlInspectionSummary.recordsInspected
  )}`
);

console.log(
  `Verdict subcategory: ${formatCoverage(
    xmlInspectionSummary.verdictSubcategoryPresent,
    xmlInspectionSummary.recordsInspected
  )}`
);

console.log(
  `Plea: ${formatCoverage(
    xmlInspectionSummary.pleaPresent,
    xmlInspectionSummary.recordsInspected
  )}`
);

console.log(
  `Punishment: ${formatCoverage(
    xmlInspectionSummary.punishmentPresent,
    xmlInspectionSummary.recordsInspected
  )}`
);
  console.log("\n============================================\n");
  
function createCoverageEntry(present, total) {
  return {
    present,
    total,
    coveragePercent:
      total === 0
        ? 0
        : Number(((present / total) * 100).toFixed(1)),
  };
}

  const sourceMissingVerdictRecords = 
  missingFieldRecords.filter((record) =>
    record.missingFields.includes("verdict_category")
  ).length;

  const xmlInspectionReport = {
  recordsInspected: xmlInspectionSummary.recordsInspected,

  defendantName: createCoverageEntry(
    xmlInspectionSummary.defendantNamePresent,
    xmlInspectionSummary.recordsInspected
  ),

  defendantGender: createCoverageEntry(
    xmlInspectionSummary.defendantGenderPresent,
    xmlInspectionSummary.recordsInspected
  ),

  offenceCategory: createCoverageEntry(
    xmlInspectionSummary.offenceCategoryPresent,
    xmlInspectionSummary.recordsInspected
  ),

  offenceSubcategory: createCoverageEntry(
    xmlInspectionSummary.offenceSubcategoryPresent,
    xmlInspectionSummary.recordsInspected
  ),

  verdictCategory: createCoverageEntry(
    xmlInspectionSummary.verdictCategoryPresent,
    xmlInspectionSummary.recordsInspected
  ),

  verdictSubcategory: createCoverageEntry(
    xmlInspectionSummary.verdictSubcategoryPresent,
    xmlInspectionSummary.recordsInspected
  ),

  plea: createCoverageEntry(
    xmlInspectionSummary.pleaPresent,
    xmlInspectionSummary.recordsInspected
  ),

  punishment: createCoverageEntry(
    xmlInspectionSummary.punishmentPresent,
    xmlInspectionSummary.recordsInspected
  ),

  qualityAssessment: {
  nonTrialRecordsExcluded: nonTrialRecords.length,
  sourceMissingVerdictRecords,
  parserFailures: 0,
}
};

function isNonTrialRecord(record) {
  const title =
    record?._source?.title?.toLowerCase() ?? "";

return (
  title.startsWith("front matter") ||
  title.startsWith("punishment summary") ||
  title.startsWith("supplementary material") ||
  title.startsWith("advertisements")
);
}

console.log("\n============================================\n");

const transcriptsAt500 =
  transformedRecords.filter(
    (record) => (record.transcript_text?.length ?? 0) === 500
  ).length;

const transcriptsOver500 =
  transformedRecords.filter(
    (record) => (record.transcript_text?.length ?? 0) > 500
  ).length;

const transcriptsUnder500 =
  transformedRecords.filter(
    (record) => {
      const length = record.transcript_text?.length ?? 0;
      return length > 0 && length < 500;
    }
  ).length;

const missingTranscripts =
  transformedRecords.filter(
    (record) => !record.transcript_text
  ).length;

console.log("========== TRANSCRIPT SUMMARY ==========");
console.log(`Records checked: ${transformedRecords.length}`);
console.log(`Over 500 chars: ${transcriptsOver500}`);
console.log(`Exactly 500 chars: ${transcriptsAt500}`);
console.log(`Under 500 chars: ${transcriptsUnder500}`);
console.log(`Missing transcripts: ${missingTranscripts}`);

console.log("\n========== REVIEW REQUIRED RECORDS ==========\n");

const recordsNeedingReview = transformedRecords
  .map((record, index) => {
    const source = trialRecords[index]?._source;

    const missing = [];

    if (!record.defendant_name) {
      missing.push("Defendant");
    }

    if (!record.verdict) {
      missing.push("Verdict");
    }

    if (!record.trial_date) {
      missing.push("Trial Date");
    }

    return {
      index,
      record,
      source,
      missing,
    };
  })
  .filter((item) => item.missing.length > 0);

if (recordsNeedingReview.length === 0) {
  console.log("None");
} else {
  for (const item of recordsNeedingReview) {
    const {
      index,
      record,
      source,
      missing,
    } = item;

    console.log("----------------------------------------");
    console.log(`Record ${index + 1}`);
    console.log("Status: REVIEW REQUIRED");
    console.log(`Source ID: ${record.source_case_id}`);
    console.log(`Title: ${source?.title ?? "Missing"}`);
    console.log(
      `Missing fields: ${missing.join(", ")}`
    );
    console.log("");
  }
}


console.log("========== VALIDATION SUMMARY ==========\n");
console.log(`Valid: ${validationSummary.valid}`);
console.log(`Valid with warnings: ${validationSummary.validWithWarnings}`);
console.log(`Invalid: ${validationSummary.invalid}`);
console.log(`Total errors: ${validationSummary.totalErrors}`);
console.log(`Total warnings: ${validationSummary.totalWarnings}`);

console.log("\n========== IMPORT SUMMARY ==========\n");

console.log(`Records returned: ${records.length}`);
console.log(`Records transformed: ${transformedRecords.length}`);

console.log(`Ready for import: ${readyForImport}`);
console.log(`Needs review: ${reviewRequired}`);

console.log(`Missing defendant: ${qualitySummary.missingDefendantName}`);
console.log(`Missing verdict: ${qualitySummary.missingVerdict}`);
console.log(`Missing trial date: ${qualitySummary.missingTrialDate}`);

console.log("\n====================================");

if (duplicateCheck.duplicateRecords.length > 0) {
  console.log("\n========== BATCH DUPLICATES ==========\n");

  for (const item of duplicateCheck.duplicateRecords) {
    console.log(`Source ID: ${item.record.source_case_id}`);
    console.log(`Duplicate of row: ${item.duplicateOfRow}`);
    console.log("");
  }

  console.log("======================================\n");
}

console.log("\n========== DATABASE READINESS SUMMARY ==========\n");

console.log(
  `API-ready records: ${apiReadyRecords.length}`
);

console.log(
  `Batch duplicates: ${duplicateCheck.duplicateRecords.length}`
);

console.log(
  `Database duplicates: ${
    databaseDuplicateCheck.databaseDuplicates.length
  }`
);

console.log(
  `Ready for insertion: ${
    databaseDuplicateCheck.readyRecords.length
  }`
);

console.log("\nDatabase changes: 0");

console.log("\n================================================\n");

const reportPath = await writeApiReviewReport({
  query: query,
  records,
  transformedRecords,
  qualitySummary,
  validationSummary,
  reviewedRecords,
  xmlInspection: xmlInspectionReport,
});

console.log("\nAPI review report created:");
console.log(reportPath);

  } catch (error) {
    console.error(error.message);
  }
}

console.log("\n============================================");

fetchOldBaileyRecords();