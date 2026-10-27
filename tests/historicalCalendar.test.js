import test from "node:test";
import assert from "node:assert/strict";

import { isValidHistoricalDate } from
  "../src/import/historicalCalendar.js";

test("accepts Julian leap day in 1700", () => {
  assert.equal(
    isValidHistoricalDate("1700-02-29"),
    true
  );
});

test("rejects invalid Julian leap day in 1751", () => {
  assert.equal(
    isValidHistoricalDate("1751-02-29"),
    false
  );
});

test("rejects skipped British calendar dates in September 1752", () => {
  assert.equal(
    isValidHistoricalDate("1752-09-10"),
    false
  );
});

test("accepts the final Julian calendar date in Britain", () => {
  assert.equal(
    isValidHistoricalDate("1752-09-02"),
    true
  );
});

test("accepts the first Gregorian calendar date in Britain", () => {
  assert.equal(
    isValidHistoricalDate("1752-09-14"),
    true
  );
});

test("rejects impossible days within a month", () => {
  assert.equal(
    isValidHistoricalDate("1750-02-31"),
    false
  );
});

test("rejects dates without YYYY-MM-DD formatting", () => {
  assert.equal(
    isValidHistoricalDate("1750-2-09"),
    false
  );
});