import test from "node:test";
import assert from "node:assert/strict";
import { fetchOldBaileyJson } from "../src/import/fetchOldBaileyJson.js";

test("returns JSON from a successful API response", async () => {
  const originalFetch = globalThis.fetch;

  try {
    const expectedData = {
      hits: {
        total: 1,
        hits: [{ _id: "t16740429-1" }],
      },
    };

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => expectedData,
    });

    const result = await fetchOldBaileyJson(
      "https://example.test/oldbailey"
    );

    assert.deepEqual(result, expectedData);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an unsuccessful HTTP response", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await assert.rejects(
      fetchOldBaileyJson("https://example.test/oldbailey"),
      /Old Bailey API request failed: 404 Not Found/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aborts an API request when the timeout is exceeded", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        const signal = options.signal;

        if (signal.aborted) {
          reject(
            Object.assign(new Error("Request aborted"), {
              name: "AbortError",
            })
          );
          return;
        }

        signal.addEventListener(
          "abort",
          () => {
            reject(
              Object.assign(new Error("Request aborted"), {
                name: "AbortError",
              })
            );
          },
          { once: true }
        );
      });
    };

    await assert.rejects(
      fetchOldBaileyJson("https://example.test/oldbailey", {
        timeoutMs: 20,
        maxAttempts: 1,
     }),
     { name: "AbortError" }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retries a temporary HTTP 503 failure", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async () => {
      attempts += 1;

      if (attempts === 1) {
        return {
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ recovered: true }),
      };
    };

    const result = await fetchOldBaileyJson(
      "https://example.test/oldbailey",
      {
        maxAttempts: 3,
        retryDelayMs: 1,
      }
    );

    assert.deepEqual(result, { recovered: true });
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stops retrying after the maximum number of attempts", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async () => {
      attempts += 1;

      return {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      };
    };

    await assert.rejects(
      fetchOldBaileyJson("https://example.test/oldbailey", {
        maxAttempts: 3,
        retryDelayMs: 1,
      }),
      /Old Bailey API request failed: 503 Service Unavailable/
    );

    assert.equal(attempts, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry a permanent HTTP 404 error", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async () => {
      attempts += 1;

      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
      };
    };

    await assert.rejects(
      fetchOldBaileyJson("https://example.test/oldbailey", {
        maxAttempts: 3,
        retryDelayMs: 1,
      }),
      /Old Bailey API request failed: 404 Not Found/
    );

    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retries a temporary network failure", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new TypeError("fetch failed");
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ recovered: true }),
      };
    };

    const result = await fetchOldBaileyJson(
      "https://example.test/oldbailey",
      {
        maxAttempts: 3,
        retryDelayMs: 1,
      }
    );

    assert.deepEqual(result, { recovered: true });
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retries a timed-out request and recovers", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async (_url, options) => {
      attempts += 1;

      if (attempts === 1) {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => {
              const error = new Error("Request aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        });
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ recovered: true }),
      };
    };

    const result = await fetchOldBaileyJson(
      "https://example.test/oldbailey",
      {
        timeoutMs: 20,
        maxAttempts: 3,
        retryDelayMs: 1,
      }
    );

    assert.deepEqual(result, { recovered: true });
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an invalid maximum attempt count", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async () => {
      attempts += 1;

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    };

    await assert.rejects(
      fetchOldBaileyJson("https://example.test/oldbailey", {
        maxAttempts: 0,
      }),
      /maxAttempts must be a positive integer/
    );

    assert.equal(attempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an invalid timeout before making a request", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async () => {
      attempts += 1;

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    };

    await assert.rejects(
      fetchOldBaileyJson("https://example.test/oldbailey", {
        timeoutMs: 0,
      }),
      /timeoutMs must be a positive number/
    );

    assert.equal(attempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an invalid retry delay before making a request", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async () => {
      attempts += 1;

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    };

    await assert.rejects(
      fetchOldBaileyJson("https://example.test/oldbailey", {
        retryDelayMs: -1,
      }),
      /retryDelayMs must be a non-negative number/
    );

    assert.equal(attempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry a JSON parsing TypeError", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async () => {
      attempts += 1;

      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new TypeError("Invalid response processing");
        },
      };
    };

    await assert.rejects(
      fetchOldBaileyJson("https://example.test/oldbailey", {
        maxAttempts: 3,
        retryDelayMs: 1,
      }),
      /Invalid response processing/
    );

    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});