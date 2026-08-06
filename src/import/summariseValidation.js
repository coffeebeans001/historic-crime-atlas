export function summariseValidation(validationResults) {
  return validationResults.reduce(
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
}