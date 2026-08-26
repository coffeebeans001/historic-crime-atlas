import fs from "node:fs/promises";
import path from "node:path";

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

export async function writeApiReviewReport({
  query,
  records,
  transformedRecords,
  qualitySummary,
  validationSummary,
  reviewedRecords,
  xmlInspection,
  locationEnrichment,

}) {
  const generatedAt = new Date().toISOString();

  const reportDirectory = path.resolve(
    "data",
    "import-reports"
  );

  await fs.mkdir(reportDirectory, {
    recursive: true,
  });

  const readyForImport = reviewedRecords.filter(
    (record) => record.status === "READY"
  ).length;

  const needsReview = reviewedRecords.filter(
    (record) => record.status === "REVIEW_REQUIRED"
  ).length;

  const report = {
    reportType: "Old Bailey API Import Review",
    reportVersion: "1.4",
    generatedAt,
    query,
    xmlInspection,
    locationEnrichment,
    summary: {
      recordsReturned: records.length,
      recordsTransformed: transformedRecords.length,
      readyForImport,
      needsReview,
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

  const fileTimestamp = createFileTimestamp();

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