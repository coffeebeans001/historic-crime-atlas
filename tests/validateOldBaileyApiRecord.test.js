import test from "node:test";
import assert from "node:assert/strict";

import { validateOldBaileyApiRecord } from
  "../src/import/validateOldBaileyApiRecord.js";

test("accepts a complete valid Old Bailey API record", () => {
  const record = {
    source_case_id: "t17500101-1",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1750-01-01",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "VALID");
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("rejects records without a source case ID", () => {
  const record = {
    source_case_id: "",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1750-01-01",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "INVALID");
  assert.equal(result.isValid, false);
  assert.deepEqual(result.errors, [
    "Missing source case ID.",
  ]);
  assert.deepEqual(result.warnings, []);
});

test("warns when defendant and verdict are missing", () => {
  const record = {
    source_case_id: "t17500101-2",
    defendant_name: null,
    offence: "Robbery",
    verdict: null,
    trial_date: "1750-01-01",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "VALID_WITH_WARNINGS");
  assert.equal(result.isValid, true);

  assert.deepEqual(result.errors, []);

  assert.deepEqual(result.warnings, [
    "Defendant name is unavailable from the API title.",
    "Verdict is unavailable from the returned text excerpt.",
  ]);
});

test("rejects impossible historical trial dates", () => {
  const record = {
    source_case_id: "t17500231-1",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1750-02-31",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "INVALID");
  assert.equal(result.isValid, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("Invalid trial date")
    )
  );
});

test("accepts a valid leap-year trial date", () => {
  const record = {
    source_case_id: "test-leap-year",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1752-02-29",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "VALID");
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects February 29 in a non-leap year", () => {
  const record = {
    source_case_id: "test-non-leap-year",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1751-02-29",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "INVALID");
  assert.equal(result.isValid, false);
  assert.ok(
    result.errors.includes(
      "Invalid trial date: 1751-02-29"
    )
  );
});

test("accepts February 29 in a Julian leap century year", () => {
  const record = {
    source_case_id: "test-century-leap-year",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1700-02-29",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "VALID");
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects dates skipped during the British calendar transition", () => {
  const record = {
    source_case_id: "test-calendar-transition",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1752-09-10",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "INVALID");
  assert.equal(result.isValid, false);
  assert.ok(
    result.errors.includes(
      "Invalid trial date: 1752-09-10"
    )
  );
});

test("accepts the last Julian calendar day in Britain", () => {
  const record = {
    source_case_id: "test-last-julian-day",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1752-09-02",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "VALID");
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});

test("accepts the first Gregorian calendar day in Britain", () => {
  const record = {
    source_case_id: "test-first-gregorian-day",
    defendant_name: "John Smith",
    offence: "Robbery",
    verdict: "Guilty",
    trial_date: "1752-09-14",
    source_url: "https://www.oldbaileyonline.org/",
    case_summary: "Historical trial transcript.",
  };

  const result = validateOldBaileyApiRecord(record);

  assert.equal(result.status, "VALID");
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});