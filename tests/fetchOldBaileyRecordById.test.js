import test from "node:test";
import assert from "node:assert/strict";

import { fetchOldBaileyRecordById } from
  "../src/import/fetchOldBaileyRecordById.js";

test("retrieves an individual Old Bailey record", async () => {
  const originalFetch = globalThis.fetch;

  try {
    const expectedRecord = {
      _id: "t16740429-1",
      _source: {
        idkey: "t16740429-1",
      },
    };

    globalThis.fetch = async (url) => {
      assert.equal(
        url,
        "https://www.dhi.ac.uk/api/data/oldbailey_record_single?idkey=t16740429-1"
      );

      return {
        ok: true,
        status: 200,
        json: async () => ({
          hits: {
            total: 1,
            hits: [expectedRecord],
          },
        }),
      };
    };

    const result = await fetchOldBaileyRecordById(
      "t16740429-1"
    );

    assert.deepEqual(result, {
      requestedId: "t16740429-1",
      totalResults: 1,
      records: [expectedRecord],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});