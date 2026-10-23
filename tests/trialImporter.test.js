import test from "node:test";
import assert from "node:assert/strict";

import {
  importResolvedTrials,
  importTrialWithTransaction,
} from "../src/import/trialImporter.js";

test("onTrialResult receives each trial result in order", async () => {
  const receivedResults = [];

  const relationResults = [
    {
      rowNumber: 1,
      record: { source_case_id: "TEST-001" },
      defendant: null,
      judge: null,
      offence: null,
      missingReferences: ["Missing defendant"],
    },
    {
      rowNumber: 2,
      record: { source_case_id: "TEST-002" },
      defendant: null,
      judge: null,
      offence: null,
      missingReferences: ["Missing offence"],
    },
  ];

  const results = await importResolvedTrials(relationResults, {
    onTrialResult: async (result) => {
      receivedResults.push(result);
    },
  });

  assert.equal(results.length, 2);

  assert.deepEqual(
    receivedResults.map((result) => result.rowNumber),
    [1, 2]
  );

  assert.deepEqual(
    receivedResults.map((result) => result.status),
    ["UNRESOLVED", "UNRESOLVED"]
  );

  assert.deepEqual(receivedResults, results);
});

test("importResolvedTrials works without an onTrialResult callback", async () => {
  const relationResults = [
    {
      rowNumber: 1,
      record: { source_case_id: "TEST-003" },
      defendant: null,
      judge: null,
      offence: null,
      missingReferences: ["Missing defendant"],
    },
  ];

  const results = await importResolvedTrials(relationResults);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "UNRESOLVED");
  assert.equal(results[0].rowNumber, 1);
});

test("importResolvedTrials stops when onTrialResult fails", async () => {
  const relationResults = [
    {
      rowNumber: 1,
      record: { source_case_id: "TEST-004" },
      defendant: null,
      judge: null,
      offence: null,
      missingReferences: ["Missing defendant"],
    },
    {
      rowNumber: 2,
      record: { source_case_id: "TEST-005" },
      defendant: null,
      judge: null,
      offence: null,
      missingReferences: ["Missing offence"],
    },
  ];

  const processedRows = [];

  await assert.rejects(
    importResolvedTrials(relationResults, {
      onTrialResult: async (result) => {
        processedRows.push(result.rowNumber);

        throw new Error("Checkpoint write failed");
      },
    }),
    /Checkpoint write failed/
  );

  assert.deepEqual(processedRows, [1]);
});

test("existing trial is detected and transaction is rolled back", async () => {
  const calls = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql, params) {
      calls.push("execute");

      assert.match(
      sql,
        /SELECT\s+id,\s+source_case_id\s+FROM\s+trials/
      );
      assert.deepEqual(params, ["TEST-DUPLICATE-001"]);

      return [[{
        id: 123,
        source_case_id: "TEST-DUPLICATE-001",
      }]];
    },

    async rollback() {
      calls.push("rollback");
    },

    async commit() {
      calls.push("commit");
    },

    release() {
      calls.push("release");
    },
  };

  const connectionPool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  };

  const item = {
    rowNumber: 1,
    record: {
      source_case_id: "TEST-DUPLICATE-001",
    },
    defendant: { defendant_id: 1 },
    judge: { judge_id: 1 },
    offence: { offence_id: 1 },
    missingReferences: [],
  };

  const result = await importTrialWithTransaction(item, {
    connectionPool,
  });
  assert.equal(result.status, "DATABASE_DUPLICATE");
  assert.equal(result.existingTrialId, 123);

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "execute",
    "rollback",
    "release",
  ]);
});

test("new trial is inserted and transaction is committed", async () => {
  const calls = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql, params) {
      if (/SELECT\s+id,\s+source_case_id\s+FROM\s+trials/.test(sql)) {
        calls.push("select");
        assert.deepEqual(params, ["TEST-INSERT-001"]);
        return [[]];
      }

      if (/INSERT\s+INTO\s+trials/i.test(sql)) {
        calls.push("insert");
        assert.equal(params[0], "TEST-INSERT-001");
        return [{ insertId: 456 }];
      }

      throw new Error("Unexpected SQL query");
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const connectionPool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  };

  const item = {
    rowNumber: 1,
    record: {
      source_case_id: "TEST-INSERT-001",
    },
    defendant: { defendant_id: 1 },
    judge: { judge_id: 1 },
    offence: { offence_id: 1 },
    missingReferences: [],
  };

  const result = await importTrialWithTransaction(item, {
    connectionPool,
  });

  assert.equal(result.status, "INSERTED");
  assert.equal(result.trialId, 456);

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "select",
    "insert",
    "commit",
    "release",
  ]);
});

test("failed trial insertion rolls back and releases connection", async () => {
  const calls = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql) {
      if (/SELECT\s+id,\s+source_case_id\s+FROM\s+trials/.test(sql)) {
        calls.push("select");
        return [[]];
      }

      if (/INSERT\s+INTO\s+trials/i.test(sql)) {
        calls.push("insert");
        throw new Error("Simulated database insertion failure");
      }

      throw new Error("Unexpected SQL query");
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const connectionPool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  };

  const item = {
    rowNumber: 1,
    record: {
      source_case_id: "TEST-FAILED-001",
    },
    defendant: { defendant_id: 1 },
    judge: { judge_id: 1 },
    offence: { offence_id: 1 },
    missingReferences: [],
  };

  const result = await importTrialWithTransaction(item, {
    connectionPool,
  });

  assert.equal(result.status, "FAILED");

  assert.deepEqual(result.errors, [
    "Simulated database insertion failure",
  ]);

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "select",
    "insert",
    "rollback",
    "release",
  ]);
});

test("duplicate-key error is verified and classified as DATABASE_DUPLICATE", async () => {
  const calls = [];
  let lookupCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql, params) {
      if (/SELECT\s+id,\s+source_case_id\s+FROM\s+trials/.test(sql)) {
        calls.push("select");
        lookupCount++;

        assert.deepEqual(params, ["TEST-RACE-001"]);

        if (lookupCount === 1) {
          return [[]];
        }

        return [[{
          id: 789,
          source_case_id: "TEST-RACE-001",
        }]];
      }

      if (/INSERT\s+INTO\s+trials/i.test(sql)) {
        calls.push("insert");

        const error = new Error("Duplicate entry");
        error.code = "ER_DUP_ENTRY";
        error.errno = 1062;

        throw error;
      }

      throw new Error("Unexpected SQL query");
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const connectionPool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  };

  const item = {
    rowNumber: 1,
    record: {
      source_case_id: "TEST-RACE-001",
    },
    defendant: { defendant_id: 1 },
    judge: { judge_id: 1 },
    offence: { offence_id: 1 },
    missingReferences: [],
  };

  const result = await importTrialWithTransaction(item, {
    connectionPool,
  });

  assert.equal(result.status, "DATABASE_DUPLICATE");
  assert.equal(result.existingTrialId, 789);
  assert.equal(lookupCount, 2);

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "select",
    "insert",
    "rollback",
    "select",
    "release",
  ]);
});

test("failed duplicate verification returns FAILED", async () => {
  const calls = [];
  let lookupCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql) {
      if (/SELECT\s+id,\s+source_case_id\s+FROM\s+trials/.test(sql)) {
        calls.push("select");
        lookupCount++;

        if (lookupCount === 1) {
          return [[]];
        }

        throw new Error("Simulated duplicate verification failure");
      }

      if (/INSERT\s+INTO\s+trials/i.test(sql)) {
        calls.push("insert");

        const error = new Error("Duplicate entry");
        error.code = "ER_DUP_ENTRY";
        error.errno = 1062;

        throw error;
      }

      throw new Error("Unexpected SQL query");
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const connectionPool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  };

  const item = {
    rowNumber: 1,
    record: {
      source_case_id: "TEST-VERIFY-FAILED-001",
    },
    defendant: { defendant_id: 1 },
    judge: { judge_id: 1 },
    offence: { offence_id: 1 },
    missingReferences: [],
  };

  const result = await importTrialWithTransaction(item, {
    connectionPool,
  });

  assert.equal(result.status, "FAILED");

  assert.deepEqual(result.errors, [
    "Duplicate entry",
    "Duplicate verification failed: Simulated duplicate verification failure",
  ]);

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "select",
    "insert",
    "rollback",
    "select",
    "release",
  ]);
});

test("rollback failure still returns FAILED and releases connection", async () => {
  const calls = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql) {
      if (/SELECT\s+id,\s+source_case_id\s+FROM\s+trials/.test(sql)) {
        calls.push("select");
        return [[]];
      }

      if (/INSERT\s+INTO\s+trials/i.test(sql)) {
        calls.push("insert");
        throw new Error("Simulated insertion failure");
      }

      throw new Error("Unexpected SQL query");
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
      throw new Error("Simulated rollback failure");
    },

    release() {
      calls.push("release");
    },
  };

  const connectionPool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  };

  const item = {
    rowNumber: 1,
    record: {
      source_case_id: "TEST-ROLLBACK-001",
    },
    defendant: { defendant_id: 1 },
    judge: { judge_id: 1 },
    offence: { offence_id: 1 },
    missingReferences: [],
  };

  const result = await importTrialWithTransaction(item, {
    connectionPool,
  });

  assert.equal(result.status, "FAILED");
  assert.deepEqual(result.errors, [
    "Simulated insertion failure",
    "Transaction rollback failed: Simulated rollback failure",
  ]);

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "select",
    "insert",
    "rollback",
    "release",
  ]);
});

test("commit failure returns FAILED and attempts rollback", async () => {
  const calls = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql) {
      if (/SELECT\s+id,\s+source_case_id\s+FROM\s+trials/.test(sql)) {
        calls.push("select");
        return [[]];
      }

      if (/INSERT\s+INTO\s+trials/i.test(sql)) {
        calls.push("insert");
        return [{ insertId: 999 }];
      }

      throw new Error("Unexpected SQL query");
    },

    async commit() {
      calls.push("commit");
      throw new Error("Simulated commit failure");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const connectionPool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  };

  const item = {
    rowNumber: 1,
    record: {
      source_case_id: "TEST-COMMIT-001",
    },
    defendant: { defendant_id: 1 },
    judge: { judge_id: 1 },
    offence: { offence_id: 1 },
    missingReferences: [],
  };

  const result = await importTrialWithTransaction(item, {
    connectionPool,
  });

  assert.equal(result.status, "FAILED");

  assert.deepEqual(result.errors, [
    "Simulated commit failure",
  ]);

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "select",
    "insert",
    "commit",
    "rollback",
    "release",
  ]);
});

test("duplicate-key rollback failure returns FAILED without verification", async () => {
  const calls = [];
  let lookupCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql) {
      if (/SELECT\s+id,\s+source_case_id\s+FROM\s+trials/.test(sql)) {
        calls.push("select");
        lookupCount++;

        if (lookupCount === 1) {
          return [[]];
        }

        throw new Error(
          "Duplicate verification must not run after rollback failure"
        );
      }

      if (/INSERT\s+INTO\s+trials/i.test(sql)) {
        calls.push("insert");

        const error = new Error("Duplicate entry");
        error.code = "ER_DUP_ENTRY";
        error.errno = 1062;

        throw error;
      }

      throw new Error("Unexpected SQL query");
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
      throw new Error("Simulated rollback failure");
    },

    release() {
      calls.push("release");
    },
  };

  const connectionPool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  };

  const item = {
    rowNumber: 1,
    record: {
      source_case_id: "TEST-ROLLBACK-DUPLICATE-001",
    },
    defendant: { defendant_id: 1 },
    judge: { judge_id: 1 },
    offence: { offence_id: 1 },
    missingReferences: [],
  };

  const result = await importTrialWithTransaction(item, {
    connectionPool,
  });

  assert.equal(result.status, "FAILED");

  assert.deepEqual(result.errors, [
    "Duplicate entry",
    "Transaction rollback failed: Simulated rollback failure",
  ]);

  assert.equal(lookupCount, 1);

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "select",
    "insert",
    "rollback",
    "release",
  ]);
});