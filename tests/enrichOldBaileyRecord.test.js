import test from "node:test";
import assert from "node:assert/strict";

import { enrichOldBaileyRecord } from
  "../src/import/enrichOldBaileyRecord.js";

test("enriches an Old Bailey record using its detailed XML", async () => {
  const originalRecord = {
    _source: {
      idkey: "t16781211e-1",
      title: "Theft. 11th December 1678.",
    },
  };

  const xml = `
    <div1 type="trialAccount" id="t16781211e-1">
      <interp
        inst="t16781211e-1"
        type="date"
        value="16781211"
      />
    </div1>
  `;

  const detailedRecord = {
    _source: {
      idkey: "t16781211e-1",
      xml,
    },
  };

  const expectedParsedXmlData = {
    defendantName: null,
    offenceCategory: null,
  };

  const fetchRecord = async (idkey) => {
    assert.equal(idkey, "t16781211e-1");

    return {
      records: [detailedRecord],
    };
  };

  const parseXml = (receivedXml) => {
    assert.equal(receivedXml, xml);

    return expectedParsedXmlData;
  };

  const result = await enrichOldBaileyRecord(
    originalRecord,
    fetchRecord,
    parseXml
  );

  assert.deepEqual(result, {
    originalRecord,
    detailedRecord,
    parsedXmlData: expectedParsedXmlData,
  });
});

test("handles a record with no source ID", async () => {
  const originalRecord = {
    _source: {
      title: "Unknown trial",
    },
  };

  const fetchRecord = async () => {
    throw new Error("Fetch should not be called");
  };

  const parseXml = () => {
    throw new Error("Parser should not be called");
  };

  const result = await enrichOldBaileyRecord(
    originalRecord,
    fetchRecord,
    parseXml
  );

  assert.deepEqual(result, {
    searchRecord: originalRecord,
    detailedRecord: null,
    parsedXmlData: null,
  });
});

test("handles a missing detailed record", async () => {
  const originalRecord = {
    _source: {
      idkey: "t16781211e-1",
    },
  };

  const fetchRecord = async (idkey) => {
    assert.equal(idkey, "t16781211e-1");

    return {
      records: [],
    };
  };

  const expectedParsedXmlData = {
    defendantName: null,
  };

  const parseXml = (xml) => {
    assert.equal(xml, "");

    return expectedParsedXmlData;
  };

  const result = await enrichOldBaileyRecord(
    originalRecord,
    fetchRecord,
    parseXml
  );

  assert.deepEqual(result, {
    originalRecord,
    detailedRecord: null,
    parsedXmlData: expectedParsedXmlData,
  });
});

test("rejects a detailed record with a mismatched source ID", async () => {
  const originalRecord = {
    _source: {
      idkey: "t16781211e-1",
    },
  };

  const detailedRecord = {
    _source: {
      idkey: "t16781211e-2",
      xml: "<trial>Different trial</trial>",
    },
  };

  const fetchRecord = async (idkey) => {
    assert.equal(idkey, "t16781211e-1");

    return {
      records: [detailedRecord],
    };
  };

  const parseXml = () => {
    throw new Error(
      "Parser should not be called for a mismatched source ID"
    );
  };

  await assert.rejects(
    enrichOldBaileyRecord(
      originalRecord,
      fetchRecord,
      parseXml
    ),
    /Detailed record ID mismatch/
  );
});