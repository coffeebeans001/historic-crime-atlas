export function summariseTransformation(records) {
  return records.reduce(
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
      totalTransformed: records.length,
      missingSourceCaseId: 0,
      missingDefendantName: 0,
      missingOffence: 0,
      missingVerdict: 0,
      missingTrialDate: 0,
      missingSourceUrl: 0,
    }
  );
}