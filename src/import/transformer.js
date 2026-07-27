/**
 * Converts an empty string or whitespace-only string to null.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function emptyToNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmedValue = String(value).trim();

  return trimmedValue === "" ? null : trimmedValue;
}

/**
 * Converts a CSV value to an integer.
 * Invalid or empty values are returned as null for later validation.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toIntegerOrNull(value) {
  const cleanedValue = emptyToNull(value);

  if (cleanedValue === null) {
    return null;
  }

  if (!/^-?\d+$/.test(cleanedValue)) {
    return null;
  }

  return Number.parseInt(cleanedValue, 10);
}

/**
 * Converts common gender variations to canonical values.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normaliseGender(value) {
  const cleanedValue = emptyToNull(value);

  if (cleanedValue === null) {
    return null;
  }

  const genderMappings = {
    m: "Male",
    male: "Male",
    man: "Male",
    f: "Female",
    female: "Female",
    woman: "Female",
    unknown: "Unknown",
    unspecified: "Unknown",
  };

  const lookupValue = cleanedValue.toLowerCase();

  return genderMappings[lookupValue] ?? cleanedValue;
}

/**
 * Converts common verdict variations to canonical values.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normaliseVerdict(value) {
  const cleanedValue = emptyToNull(value);

  if (cleanedValue === null) {
    return null;
  }

  const verdictMappings = {
    guilty: "Guilty",
    convicted: "Guilty",
    "not guilty": "Not Guilty",
    not_guilty: "Not Guilty",
    acquitted: "Not Guilty",
  };

  const lookupValue = cleanedValue.toLowerCase();

  return verdictMappings[lookupValue] ?? cleanedValue;
}

/**
 * Cleans ordinary text fields without changing their meaning.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function cleanText(value) {
  return emptyToNull(value);
}

/**
 * Transforms one raw CSV record into a clean import record.
 *
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>}
 */
export function transformRecord(record) {
  return {
    source_case_id: cleanText(record.source_case_id),
    trial_date: cleanText(record.trial_date),
    defendant_name: cleanText(record.defendant_name),
    gender: normaliseGender(record.gender),
    offence: cleanText(record.offence),
    verdict: normaliseVerdict(record.verdict),
    judge_name: cleanText(record.judge_name),
    trial_location: cleanText(record.trial_location),
    source_url: cleanText(record.source_url),
    case_summary: cleanText(record.case_summary),
    defendant_age: toIntegerOrNull(record.defendant_age),
    witness_count: toIntegerOrNull(record.witness_count),
    sentence_duration: cleanText(record.sentence_duration),
    appeal_outcome: cleanText(record.appeal_outcome),
    trial_type: cleanText(record.trial_type),
  };
}

/**
 * Transforms every record in an array.
 *
 * @param {Record<string, unknown>[]} records
 * @returns {Record<string, unknown>[]}
 */
export function transformRecords(records) {
  return records.map(transformRecord);
}