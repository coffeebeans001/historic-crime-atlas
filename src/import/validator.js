const ALLOWED_GENDERS = new Set([
  "Male",
  "Female",
  "Unknown",
]);

const ALLOWED_VERDICTS = new Set([
  "Guilty",
  "Not Guilty",
]);

/**
 * Checks whether a value contains usable text.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Checks whether a date uses YYYY-MM-DD format
 * and represents a real calendar date.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidDate(value) {
  if (!hasText(value)) {
    return false;
  }

  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!dateMatch) {
    return false;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Checks whether a string is a valid HTTP or HTTPS URL.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidHttpUrl(value) {
  if (!hasText(value)) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates one transformed import record.
 *
 * @param {Record<string, unknown>} record
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateRecord(record) {
  const errors = [];

  if (!hasText(record.source_case_id)) {
    errors.push("source_case_id is required.");
  }

  if (!hasText(record.trial_date)) {
    errors.push("trial_date is required.");
  } else if (!isValidDate(record.trial_date)) {
    errors.push(
      `trial_date "${record.trial_date}" is not a valid YYYY-MM-DD calendar date.`
    );
  }

  if (!hasText(record.defendant_name)) {
    errors.push("defendant_name is required.");
  }

  if (!hasText(record.offence)) {
    errors.push("offence is required.");
  }

  if (!hasText(record.verdict)) {
    errors.push("verdict is required.");
  } else if (!ALLOWED_VERDICTS.has(record.verdict)) {
    errors.push(
      `verdict "${record.verdict}" is not supported.`
    );
  }

  if (!hasText(record.source_url)) {
    errors.push("source_url is required.");
  } else if (!isValidHttpUrl(record.source_url)) {
    errors.push(
      `source_url "${record.source_url}" is not a valid HTTP or HTTPS URL.`
    );
  }

  if (
    record.gender !== null &&
    !ALLOWED_GENDERS.has(record.gender)
  ) {
    errors.push(
      `gender "${record.gender}" is not supported.`
    );
  }

  if (
    record.defendant_age !== null &&
    (!Number.isInteger(record.defendant_age) ||
      record.defendant_age < 0)
  ) {
    errors.push(
      "defendant_age must be a non-negative whole number or null."
    );
  }

  if (
    record.witness_count !== null &&
    (!Number.isInteger(record.witness_count) ||
      record.witness_count < 0)
  ) {
    errors.push(
      "witness_count must be a non-negative whole number or null."
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates all transformed records.
 *
 * @param {Record<string, unknown>[]} records
 * @returns {{
 *   results: Array<{
 *     rowNumber: number,
 *     record: Record<string, unknown>,
 *     isValid: boolean,
 *     errors: string[]
 *   }>,
 *   validRecords: Record<string, unknown>[],
 *   invalidRecords: Array<{
 *     rowNumber: number,
 *     record: Record<string, unknown>,
 *     errors: string[]
 *   }>
 * }}
 */
export function validateRecords(records) {
  const results = records.map((record, index) => {
    const validation = validateRecord(record);

    return {
      rowNumber: index + 1,
      record,
      isValid: validation.isValid,
      errors: validation.errors,
    };
  });

  const validRecords = results
    .filter((result) => result.isValid)
    .map((result) => result.record);

  const invalidRecords = results
    .filter((result) => !result.isValid)
    .map((result) => ({
      rowNumber: result.rowNumber,
      record: result.record,
      errors: result.errors,
    }));

  return {
    results,
    validRecords,
    invalidRecords,
  };
}