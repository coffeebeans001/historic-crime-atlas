export function createApiReviewRecords({
  records,
  transformedRecords,
  validationResults,
}) {
  return transformedRecords.map((record, index) => {
    const source = records[index]?._source ?? {};
    const validation = validationResults[index];

    const transcriptLength = source.text?.length ?? 0;
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
  });
}