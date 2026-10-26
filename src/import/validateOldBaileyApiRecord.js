export function validateOldBaileyApiRecord(record) {
  const errors = [];
  const warnings = [];

  if (!record || typeof record !== "object") {
    return {
      status: "INVALID",
      isValid: false,
      errors: ["Record must be an object."],
      warnings,
    };
  }

  if (!record.source_case_id?.trim()) {
    errors.push("Missing source case ID.");
  }

  if (!record.offence?.trim()) {
    errors.push("Missing offence.");
  }

  if (!record.trial_date?.trim()) {
    errors.push("Missing trial date.");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(record.trial_date)) {
    errors.push(
      `Trial date must use YYYY-MM-DD format: ${record.trial_date}`
    );
  } else {
    const [year, month, day] =
      record.trial_date.split("-").map(Number);

    const usesJulianCalendar =
      year < 1752 ||
      (year === 1752 && month < 9);

    const isLeapYear = usesJulianCalendar
      ? year % 4 === 0
      : year % 4 === 0 &&
        (year % 100 !== 0 || year % 400 === 0);

    const daysInMonth = [
      31,
      isLeapYear ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];

    const isSkippedBritishDate =
      year === 1752 &&
      month === 9 &&
      day >= 3 &&
      day <= 13;

    if (
      year === 0 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > (daysInMonth[month - 1] ?? 0) ||
      isSkippedBritishDate
    ) {
      errors.push(
        `Invalid trial date: ${record.trial_date}`
      );
    }
  }

  if (!record.source_url?.trim()) {
    errors.push("Missing source URL.");
  } else {
    try {
      const parsedUrl = new URL(record.source_url);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        errors.push("Source URL must use HTTP or HTTPS.");
      }
    } catch {
      errors.push(`Invalid source URL: ${record.source_url}`);
    }
  }

  if (!record.defendant_name?.trim()) {
    warnings.push(
      "Defendant name is unavailable from the API title."
    );
  }

  if (!record.verdict?.trim()) {
    warnings.push(
      "Verdict is unavailable from the returned text excerpt."
    );
  }

  if (
    record.case_summary &&
    record.case_summary.length === 500
  ) {
    warnings.push(
      "Source text may be truncated at 500 characters."
    );
  }

  const isValid = errors.length === 0;

  let status = "VALID";

  if (!isValid) {
    status = "INVALID";
  } else if (warnings.length > 0) {
    status = "VALID_WITH_WARNINGS";
  }

  return {
    status,
    isValid,
    errors,
    warnings,
  };
}