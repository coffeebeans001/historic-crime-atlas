import test from "node:test";
import assert from "node:assert/strict";

import { fetchOldBaileyPages } from
  "../src/import/fetchOldBaileyPages.js";

test("fetches multiple pages and respects the requested record count", async () => {
  const requestedUrls = [];

  const mockFetchPage = async (url) => {
    requestedUrls.push(url);

    const from = Number(
      new URL(url).searchParams.get("from")
    );

    const records = Array.from(
      { length: 10 },
      (_, index) => ({
        _source: {
          idkey: `trial-${from + index}`,
        },
      })
    );

    return {
      hits: {
        total: 100,
        hits: records,
      },
    };
  };

  const result = await fetchOldBaileyPages({
    query: "robbery",
    startOffset: 0,
    recordCount: 25,
    pageSize: 10,
    fetchPage: mockFetchPage,
  });

  assert.deepEqual(
    requestedUrls.map(
      (url) => Number(new URL(url).searchParams.get("from"))
    ),
    [0, 10, 20]
  );

  assert.equal(result.records.length, 25);
  assert.equal(result.totalResults, 100);

  assert.equal(
    result.records[0]._source.idkey,
    "trial-0"
  );

  assert.equal(
    result.records[24]._source.idkey,
    "trial-24"
  );
});

test("calls the progress callback after each successful page", async () => {
  const reportedPages = [];

  const mockFetchPage = async (url) => {
    const from = Number(
      new URL(url).searchParams.get("from")
    );

    return {
      hits: {
        total: 50,
        hits: [
          {
            _source: {
              idkey: `trial-${from}`,
            },
          },
        ],
      },
    };
  };

  await fetchOldBaileyPages({
    query: "robbery",
    startOffset: 0,
    recordCount: 25,
    pageSize: 10,
    fetchPage: mockFetchPage,
    onPage: ({ from, query, pageData, pageRecords }) => {
      reportedPages.push({
        from,
        query,
        total: pageData.hits.total,
        count: pageRecords.length,
      });
    },
  });

  assert.deepEqual(reportedPages, [
    {
      from: 0,
      query: "robbery",
      total: 50,
      count: 1,
    },
    {
      from: 10,
      query: "robbery",
      total: 50,
      count: 1,
    },
    {
      from: 20,
      query: "robbery",
      total: 50,
      count: 1,
    },
  ]);
});

test("fetches records from a non-zero starting offset", async () => {
  const requestedOffsets = [];

  const mockFetchPage = async (url) => {
    const from = Number(
      new URL(url).searchParams.get("from")
    );

    requestedOffsets.push(from);

    return {
      hits: {
        total: 100,
        hits: Array.from({ length: 10 }, (_, index) => ({
          _source: {
            idkey: `trial-${from + index}`,
          },
        })),
      },
    };
  };

  const result = await fetchOldBaileyPages({
    query: "robbery",
    startOffset: 50,
    recordCount: 15,
    pageSize: 10,
    fetchPage: mockFetchPage,
  });

  assert.deepEqual(requestedOffsets, [50, 60]);
  assert.equal(result.records.length, 15);

  assert.equal(
    result.records[0]._source.idkey,
    "trial-50"
  );

  assert.equal(
    result.records[14]._source.idkey,
    "trial-64"
  );
});

test("stops pagination when the API returns an empty page", async () => {
  const requestedOffsets = [];

  const mockFetchPage = async (url) => {
    const from = Number(
      new URL(url).searchParams.get("from")
    );

    requestedOffsets.push(from);

    return {
      hits: {
        total: 10,
        hits:
          from === 0
            ? Array.from({ length: 10 }, (_, index) => ({
                _source: {
                  idkey: `trial-${index}`,
                },
              }))
            : [],
      },
    };
  };

  const result = await fetchOldBaileyPages({
    query: "robbery",
    startOffset: 0,
    recordCount: 50,
    pageSize: 10,
    fetchPage: mockFetchPage,
  });

  assert.deepEqual(requestedOffsets, [0, 10]);
  assert.equal(result.records.length, 10);
  assert.equal(result.totalResults, 10);
});