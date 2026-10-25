
import test from "node:test";
import assert from "node:assert/strict";

import { isNonTrialRecord } from
  "../src/import/isNonTrialRecord.js";

test("identifies front matter as a non-trial record", () => {
  const record = {
    _source: {
      title: "Front Matter",
    },
  };

  assert.equal(isNonTrialRecord(record), true);
});


test("identifies other non-trial categories", () => {
  const nonTrialTitles = [
    "Punishment Summary",
    "Supplementary Material",
    "Advertisements",
  ];

  for (const title of nonTrialTitles) {
    const record = {
      _source: {
        title,
      },
    };

    assert.equal(
      isNonTrialRecord(record),
      true,
      `Expected "${title}" to be classified as non-trial`
    );
  }
});


test("retains ordinary trial records", () => {
  const trialTitles = [
    "The Trial of John Smith",
    "Robbery",
    "Murder",
    "Burglary",
  ];

  for (const title of trialTitles) {
    const record = {
      _source: {
        title,
      },
    };

    assert.equal(
      isNonTrialRecord(record),
      false,
      `Expected "${title}" to remain a trial candidate`
    );
  }
});


test("handles records with missing titles", () => {
  const records = [
    {},
    { _source: {} },
    { _source: { title: null } },
    { _source: { title: "" } },
    null,
  ];

  for (const record of records) {
    assert.equal(
      isNonTrialRecord(record),
      false,
      "Expected a record without a title to remain a candidate"
    );
  }
});

