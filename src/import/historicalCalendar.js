/**
 * Validates a historical British calendar date.
 *
 * Provisional policy:
 * - Julian calendar before September 1752.
 * - Gregorian calendar from September 1752.
 * - Rejects 3–13 September 1752.
 *
 * Dates are preserved as written, without
 * automatic Julian-to-Gregorian conversion.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidHistoricalDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] =
    value.split("-").map(Number);

  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

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

  return (
    day <= daysInMonth[month - 1] &&
    !isSkippedBritishDate
  );
}