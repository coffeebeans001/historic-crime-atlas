import test from "node:test";
import assert from "node:assert/strict";

import { validateRecord } from
  "../src/import/validator.js";

test("accepts a valid Julian leap-day trial date", () => {
  const record = {
    source_case_id: "test-julian-1700",
    trial_date: "1700-02-29",
    defendant_name: "Historical Defendant",
    offence: "Robbery",
  };

  const result = validateRecord(record);

  assert.equal(
    result.errors.some(
      (error) => error.includes("trial_date")
    ),
    false
  );
});