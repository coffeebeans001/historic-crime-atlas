import test from "node:test";
import assert from "node:assert/strict";

import { transformOldBaileyRecord } from
  "../src/import/transformOldBaileyRecord.js";

test("rejects API records without a _source object", () => {
  const record = {};

  assert.throws(
    () => transformOldBaileyRecord(record, null),
    {
      message:
        "The Old Bailey API record does not contain a _source object.",
    }
  );
});

test("prioritises structured XML over title information", () => {
  const record = {
    _source: {
      idkey: "test-xml-precedence",
      title: "John Smith. Robbery. 1st January 1750",
      text: "Historical trial transcript.",
      images: [],
    },
  };

  const parsedXmlData = {
    defendantName: "William Jones",
    offenceText: "Burglary",
    verdictCategory: "notGuilty",
  };

  const result = transformOldBaileyRecord(
    record,
    parsedXmlData
  );

  assert.equal(result.defendant_name, "William Jones");
  assert.equal(result.offence, "Burglary");
  assert.equal(result.verdict, "Not Guilty");
  assert.equal(result.trial_date, "1750-01-01");
});

test("uses reviewed historical locations when XML location is missing", () => {
  const record = {
    _source: {
      idkey: "t17700530-48",
      title: "Historical Trial. Robbery. 30th May 1770",
      text: "Historical trial transcript.",
      images: [],
    },
  };

  const result = transformOldBaileyRecord(record, {});

  assert.equal(result.crime_location, "Edmonton");
  assert.equal(result.location_source, "narrative_reviewed");
  assert.equal(result.location_precision, "named_place");

  assert.equal(result.latitude, 51.6256101);
  assert.equal(result.longitude, -0.0579786);

  assert.equal(result.geocode_confidence, "approximate");
});

test("does not mix XML locations with reviewed location precision", () => {
  const record = {
    _source: {
      idkey: "t17700530-48",
      title: "Historical Trial. Robbery. 30th May 1770",
      text: "Historical trial transcript.",
      images: [],
    },
  };

  const parsedXmlData = {
    crimeLocation: "Hornsey",
  };

  const result = transformOldBaileyRecord(
    record,
    parsedXmlData
  );

  assert.equal(result.crime_location, "Hornsey");
  assert.equal(result.location_source, "structured_xml");

  assert.equal(result.location_precision, null);
});

test("preserves Julian leap-day dates in historical titles", () => {
  const record = {
    _source: {
      idkey: "test-julian-leap-day",
      title: "Historical Trial. Robbery. 29th February 1700",
      text: "Historical trial transcript.",
      images: [],
    },
  };

  const result = transformOldBaileyRecord(record, {});

  assert.equal(result.trial_date, "1700-02-29");
});