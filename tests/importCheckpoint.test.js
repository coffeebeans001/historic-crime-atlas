import test from "node:test";
import assert from "node:assert/strict";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  saveImportCheckpoint,
  loadImportCheckpoint,
  createImportCheckpointIdentity,
  validateImportCheckpointIdentity,
  validateImportCheckpointBatch,
  validateImportSourceCaseIds,
  recordImportTrialResult,
  shouldRetryImportTrial,
  validateImportCheckpointStructure,
  completeImportCheckpoint,
  archiveImportCheckpoint,
} from "../src/import/importCheckpoint.js";

test("saveImportCheckpoint writes a valid JSON checkpoint", async () => {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(
      temporaryDirectory,
      "checkpoint.json"
    );

    const checkpoint = {
      version: 1,
      query: "robbery",
      startOffset: 0,
      processedTrials: [
        {
          source_case_id: "TEST-001",
          status: "INSERTED",
        },
      ],
    };

    await saveImportCheckpoint(checkpointPath, checkpoint);

    const savedContent = await fs.readFile(
      checkpointPath,
      "utf8"
    );

    const savedCheckpoint = JSON.parse(savedContent);

    assert.deepEqual(savedCheckpoint, checkpoint);
    await assert.rejects(
      fs.access(`${checkpointPath}.tmp`),
      { code: "ENOENT" }
    );
  } finally {
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("saveImportCheckpoint replaces an existing checkpoint", async () => {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(
      temporaryDirectory,
      "checkpoint.json"
    );

    const firstCheckpoint = {
      version: 1,
      processedTrials: [
        { source_case_id: "TEST-001", status: "INSERTED" },
      ],
    };

    const updatedCheckpoint = {
      version: 1,
      processedTrials: [
        { source_case_id: "TEST-001", status: "INSERTED" },
        { source_case_id: "TEST-002", status: "INSERTED" },
      ],
    };

    await saveImportCheckpoint(checkpointPath, firstCheckpoint);
    await saveImportCheckpoint(checkpointPath, updatedCheckpoint);

    const savedContent = await fs.readFile(
      checkpointPath,
      "utf8"
    );

    assert.deepEqual(
      JSON.parse(savedContent),
      updatedCheckpoint
    );
  } finally {
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("failed checkpoint save preserves the previous checkpoint", async () => {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(
      temporaryDirectory,
      "checkpoint.json"
    );

    const originalCheckpoint = {
      status: "IN_PROGRESS",
      processedTrials: [
        {
          source_case_id: "TEST-SAVE-001",
          status: "INSERTED",
        },
      ],
    };

    await saveImportCheckpoint(
      checkpointPath,
      originalCheckpoint
    );

    const temporaryPath = `${checkpointPath}.tmp`;

    await fs.mkdir(temporaryPath);

    await assert.rejects(
      saveImportCheckpoint(checkpointPath, {
        status: "IN_PROGRESS",
        processedTrials: [],
      })
    );

    const recoveredCheckpoint = await loadImportCheckpoint(
      checkpointPath
    );

    assert.deepEqual(
      recoveredCheckpoint,
      originalCheckpoint
    );
  } finally {
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("loadImportCheckpoint reads a saved checkpoint", async () => {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(
      temporaryDirectory,
      "checkpoint.json"
    );

    const checkpoint = {
      version: 1,
      query: "robbery",
      startOffset: 0,
      processedTrials: [
        {
          source_case_id: "TEST-001",
          status: "INSERTED",
        },
      ],
    };

    await saveImportCheckpoint(checkpointPath, checkpoint);

    const loadedCheckpoint = await loadImportCheckpoint(
      checkpointPath
    );

    assert.deepEqual(loadedCheckpoint, checkpoint);
  } finally {
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("loadImportCheckpoint returns null when no checkpoint exists", async () => {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(
      temporaryDirectory,
      "missing-checkpoint.json"
    );

    const result = await loadImportCheckpoint(checkpointPath);

    assert.equal(result, null);
  } finally {
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("loadImportCheckpoint rejects corrupted JSON", async () => {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(
      temporaryDirectory,
      "checkpoint.json"
    );

    await fs.writeFile(
      checkpointPath,
      "{ invalid JSON",
      "utf8"
    );

    await assert.rejects(
      loadImportCheckpoint(checkpointPath),
      SyntaxError
    );
  } finally {
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("createImportCheckpointIdentity captures import settings", () => {
  const identity = createImportCheckpointIdentity({
    mode: "single-query",
    queries: ["robbery"],
    startOffset: 0,
    recordCount: 100,
    insertTrials: true,
  });

  assert.deepEqual(identity, {
    version: 1,
    mode: "single-query",
    queries: ["robbery"],
    startOffset: 0,
    recordCount: 100,
    insertTrials: true,
  });
});

test("validateImportCheckpointIdentity accepts matching identities", () => {
  const savedIdentity = createImportCheckpointIdentity({
    mode: "single-query",
    queries: ["robbery"],
    startOffset: 0,
    recordCount: 100,
    insertTrials: true,
  });

  const expectedIdentity = createImportCheckpointIdentity({
    mode: "single-query",
    queries: ["robbery"],
    startOffset: 0,
    recordCount: 100,
    insertTrials: true,
  });

  assert.equal(
    validateImportCheckpointIdentity(
      savedIdentity,
      expectedIdentity
    ),
    true
  );
});

test("validateImportCheckpointIdentity rejects mismatched settings", () => {
  const savedIdentity = createImportCheckpointIdentity({
    mode: "single-query",
    queries: ["robbery"],
    startOffset: 0,
    recordCount: 100,
    insertTrials: true,
  });

  const expectedIdentity = createImportCheckpointIdentity({
    mode: "single-query",
    queries: ["robbery"],
    startOffset: 100,
    recordCount: 100,
    insertTrials: true,
  });

  assert.throws(
    () =>
      validateImportCheckpointIdentity(
        savedIdentity,
        expectedIdentity
      ),
    /Checkpoint identity mismatch: startOffset/
  );
});

test("validateImportCheckpointIdentity rejects other configuration mismatches", () => {
  const original = createImportCheckpointIdentity({
    mode: "single-query",
    queries: ["robbery"],
    startOffset: 0,
    recordCount: 100,
    insertTrials: true,
  });

  const mismatches = [
    { field: "version", value: 2 },
    { field: "mode", value: "all-trials" },
    { field: "queries", value: ["murder"] },
    { field: "recordCount", value: 500 },
    { field: "insertTrials", value: false },
  ];

  for (const { field, value } of mismatches) {
    const modified = {
      ...original,
      [field]: value,
    };

    assert.throws(
      () => validateImportCheckpointIdentity(original, modified),
      new RegExp(`Checkpoint identity mismatch: ${field}`)
    );
  }
});

test("recordImportTrialResult records an inserted trial", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [],
  };

  const result = {
    record: {
      source_case_id: "TEST-001",
    },
    status: "INSERTED",
    trialId: 123,
  };

  const updatedCheckpoint = recordImportTrialResult(
    checkpoint,
    result
  );

  assert.deepEqual(updatedCheckpoint.processedTrials, [
    {
      source_case_id: "TEST-001",
      status: "INSERTED",
      trialId: 123,
      existingTrialId: null,
      errors: [],
    },
  ]);
});

test("recordImportTrialResult updates an existing trial", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [],
  };

  const failedResult = {
    record: { source_case_id: "TEST-002" },
    status: "FAILED",
    errors: ["Temporary database error"],
  };

  const insertedResult = {
    record: { source_case_id: "TEST-002" },
    status: "INSERTED",
    trialId: 456,
  };

  const firstCheckpoint = recordImportTrialResult(
    checkpoint,
    failedResult
  );

  const updatedCheckpoint = recordImportTrialResult(
    firstCheckpoint,
    insertedResult
  );

  assert.equal(updatedCheckpoint.processedTrials.length, 1);

  assert.deepEqual(updatedCheckpoint.processedTrials[0], {
    source_case_id: "TEST-002",
    status: "INSERTED",
    trialId: 456,
    existingTrialId: null,
    errors: [],
  });
});

test("recordImportTrialResult preserves unresolved trial details", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [],
  };

  const result = {
    record: {
      source_case_id: "TEST-003",
    },
    status: "UNRESOLVED",
    errors: ["Defendant relationship unresolved"],
  };

  const updatedCheckpoint = recordImportTrialResult(
    checkpoint,
    result
  );

  assert.deepEqual(updatedCheckpoint.processedTrials, [
    {
      source_case_id: "TEST-003",
      status: "UNRESOLVED",
      trialId: null,
      existingTrialId: null,
      errors: ["Defendant relationship unresolved"],
    },
  ]);
});

test("recordImportTrialResult rejects a missing source case ID", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [],
  };

  const result = {
    record: {},
    status: "INSERTED",
    trialId: 789,
  };

  assert.throws(
    () => recordImportTrialResult(checkpoint, result),
    /Cannot checkpoint a trial without source_case_id/
  );

  assert.equal(checkpoint.processedTrials.length, 0);
});

test("recordImportTrialResult does not mutate the original checkpoint", () => {
  const originalTrial = {
    source_case_id: "TEST-004",
    status: "FAILED",
    trialId: null,
    existingTrialId: null,
    errors: ["Temporary error"],
  };

  const checkpoint = {
    version: 1,
    processedTrials: [originalTrial],
  };

  const result = {
    record: {
      source_case_id: "TEST-004",
    },
    status: "INSERTED",
    trialId: 999,
  };

  const updatedCheckpoint = recordImportTrialResult(
    checkpoint,
    result
  );

  assert.equal(
    checkpoint.processedTrials[0].status,
    "FAILED"
  );

  assert.equal(
    updatedCheckpoint.processedTrials[0].status,
    "INSERTED"
  );

  assert.notStrictEqual(
    updatedCheckpoint.processedTrials,
    checkpoint.processedTrials
  );
});

test("shouldRetryImportTrial allows an unprocessed trial", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [],
  };

  const shouldRetry = shouldRetryImportTrial(
    checkpoint,
    "TEST-005"
  );

  assert.equal(shouldRetry, true);
});

test("shouldRetryImportTrial skips an inserted trial", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [
      {
        source_case_id: "TEST-006",
        status: "INSERTED",
        trialId: 321,
      },
    ],
  };

  const shouldRetry = shouldRetryImportTrial(
    checkpoint,
    "TEST-006"
  );

  assert.equal(shouldRetry, false);
});

test("shouldRetryImportTrial retries a failed trial", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [
      {
        source_case_id: "TEST-007",
        status: "FAILED",
        trialId: null,
        errors: ["Temporary database error"],
      },
    ],
  };

  const shouldRetry = shouldRetryImportTrial(
    checkpoint,
    "TEST-007"
  );

  assert.equal(shouldRetry, true);
});

test("shouldRetryImportTrial retries an unresolved trial", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [
      {
        source_case_id: "TEST-008",
        status: "UNRESOLVED",
        trialId: null,
        errors: ["Defendant relationship unresolved"],
      },
    ],
  };

  const shouldRetry = shouldRetryImportTrial(
    checkpoint,
    "TEST-008"
  );

  assert.equal(shouldRetry, true);
});

test("shouldRetryImportTrial skips a database duplicate", () => {
  const checkpoint = {
    version: 1,
    processedTrials: [
      {
        source_case_id: "TEST-009",
        status: "DATABASE_DUPLICATE",
        existingTrialId: 654,
      },
    ],
  };

  const shouldRetry = shouldRetryImportTrial(
    checkpoint,
    "TEST-009"
  );

  assert.equal(shouldRetry, false);
});

test("accepts a valid import checkpoint structure", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 5,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "INSERTED",
        trialId: 123,
      },
    ],
  };

  assert.equal(
    validateImportCheckpointStructure(checkpoint),
    true
  );
});

test("rejects a checkpoint with invalid processedTrials", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 5,
      insertTrials: true,
    },
    processedTrials: "invalid data",
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Invalid import checkpoint structure/
  );
});

test("rejects a checkpoint trial with a missing source ID", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 5,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "",
        status: "INSERTED",
        trialId: 123,
      },
    ],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Invalid checkpoint trial entry/
  );
});

test("rejects a checkpoint trial with a missing status", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 5,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "",
        trialId: 123,
      },
    ],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Invalid checkpoint trial entry/
  );
});

test("rejects duplicate source IDs in a checkpoint", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 5,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "INSERTED",
        trialId: 123,
      },
      {
        source_case_id: "t16751208-4",
        status: "FAILED",
        errors: ["Database error"],
      },
    ],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Duplicate checkpoint source ID/
  );
});

test("rejects an unrecognised checkpoint trial status", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 5,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "COMPLETED_SUCCESSFULLY",
        trialId: 123,
      },
    ],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Invalid checkpoint trial status/
  );
});

test("rejects an unrecognised checkpoint lifecycle status", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 5,
      insertTrials: true,
    },
    status: "UNKNOWN",
    processedTrials: [],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Invalid checkpoint lifecycle status/
  );
});

test("completes a checkpoint when all recorded trials succeeded", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 2,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "INSERTED",
        trialId: 123,
      },
      {
        source_case_id: "t16770906-7",
        status: "DATABASE_DUPLICATE",
        existingTrialId: 456,
      },
    ],
  };

  const completedCheckpoint = completeImportCheckpoint(
    checkpoint,
    ["t16751208-4", "t16770906-7"]
  );

  assert.equal(completedCheckpoint.status, "COMPLETED");
  assert.equal(checkpoint.status, "IN_PROGRESS");
  assert.equal(completedCheckpoint.processedTrials.length, 2);
});

test("rejects checkpoint completion when a trial has failed", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 2,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "INSERTED",
        trialId: 123,
      },
      {
        source_case_id: "t16770906-7",
        status: "FAILED",
        errors: ["Database connection failed"],
      },
    ],
  };

  assert.throws(
  () =>
    completeImportCheckpoint(checkpoint, [
      "t16751208-4",
      "t16770906-7",
    ]),
  /Cannot complete checkpoint: 1 unfinished trial/
);

  assert.equal(checkpoint.status, "IN_PROGRESS");
});

test("rejects completion of an empty import checkpoint", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 5,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [],
  };

  assert.throws(
  () =>
    completeImportCheckpoint(checkpoint, [
      "t16751208-4",
    ]),
  /Cannot complete an empty checkpoint/
);

  assert.equal(checkpoint.status, "IN_PROGRESS");
});

test("rejects checkpoint completion when an expected trial is missing", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 2,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "INSERTED",
        trialId: 123,
      },
    ],
  };

  assert.throws(
    () =>
      completeImportCheckpoint(checkpoint, [
        "t16751208-4",
        "t16770906-7",
      ]),
    /Cannot complete checkpoint: 1 expected trial/
  );

  assert.equal(checkpoint.status, "IN_PROGRESS");
});

test("rejects completion without an expected source ID list", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 2,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "INSERTED",
        trialId: 123,
      },
    ],
  };

  assert.throws(
    () => completeImportCheckpoint(checkpoint),
    /Expected source ID list is required/
  );

  assert.equal(checkpoint.status, "IN_PROGRESS");
});

test("rejects checkpoint completion with an unexpected trial", () => {
  const checkpoint = {
    identity: {
      version: 1,
      mode: "single-query",
      queries: ["robbery"],
      startOffset: 0,
      recordCount: 2,
      insertTrials: true,
    },
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "t16751208-4",
        status: "INSERTED",
        trialId: 123,
      },
      {
        source_case_id: "t16770906-7",
        status: "INSERTED",
        trialId: 124,
      },
    ],
  };

  assert.throws(
    () =>
      completeImportCheckpoint(checkpoint, [
        "t16751208-4",
      ]),
    /Cannot complete checkpoint: 1 unexpected trial/
  );

  assert.equal(checkpoint.status, "IN_PROGRESS");
});

test("archives a completed checkpoint without losing its contents", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(directory, "import.json");
    const archivePath = path.join(directory, "archive", "import-completed.json");

    const checkpoint = {
      identity: {
        version: 1,
        mode: "single-query",
        queries: ["robbery"],
        startOffset: 0,
        recordCount: 1,
        insertTrials: true,
      },
      status: "COMPLETED",
      processedTrials: [
        {
          source_case_id: "t16751208-4",
          status: "INSERTED",
          trialId: 123,
        },
      ],
    };

    await saveImportCheckpoint(checkpointPath, checkpoint);

    const result = await archiveImportCheckpoint(
      checkpointPath,
      archivePath
    );

    assert.equal(result, archivePath);

    const archivedCheckpoint = await loadImportCheckpoint(archivePath);
    assert.deepEqual(archivedCheckpoint, checkpoint);

    const originalCheckpoint = await loadImportCheckpoint(checkpointPath);
    assert.equal(originalCheckpoint, null);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("rejects archiving an unfinished checkpoint", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(directory, "import.json");
    const archivePath = path.join(directory, "archive", "import-completed.json");

    const checkpoint = {
      identity: {
        version: 1,
        mode: "single-query",
        queries: ["robbery"],
        startOffset: 0,
        recordCount: 1,
        insertTrials: true,
      },
      status: "IN_PROGRESS",
      processedTrials: [
        {
          source_case_id: "t16751208-4",
          status: "INSERTED",
          trialId: 123,
        },
      ],
    };

    await saveImportCheckpoint(checkpointPath, checkpoint);

    await assert.rejects(
      archiveImportCheckpoint(checkpointPath, archivePath),
      /Cannot archive checkpoint: checkpoint is not completed/
    );

    const originalCheckpoint = await loadImportCheckpoint(checkpointPath);
    assert.deepEqual(originalCheckpoint, checkpoint);

    const archivedCheckpoint = await loadImportCheckpoint(archivePath);
    assert.equal(archivedCheckpoint, null);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("rejects overwriting an existing checkpoint archive", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(directory, "import.json");
    const archivePath = path.join(directory, "archive", "import-completed.json");

    const checkpoint = {
      identity: {
        version: 1,
        mode: "single-query",
        queries: ["robbery"],
        startOffset: 0,
        recordCount: 1,
        insertTrials: true,
      },
      status: "COMPLETED",
      processedTrials: [
        {
          source_case_id: "t16751208-4",
          status: "INSERTED",
          trialId: 123,
        },
      ],
    };

    await saveImportCheckpoint(checkpointPath, checkpoint);

    await fs.mkdir(path.dirname(archivePath), {
      recursive: true,
    });

    const existingArchive = "Existing archive must be preserved";
    await fs.writeFile(archivePath, existingArchive, "utf8");

    await assert.rejects(
      archiveImportCheckpoint(checkpointPath, archivePath),
      { code: "EEXIST" }
    );

    const archiveContents = await fs.readFile(archivePath, "utf8");
    assert.equal(archiveContents, existingArchive);

    const originalCheckpoint = await loadImportCheckpoint(checkpointPath);
    assert.deepEqual(originalCheckpoint, checkpoint);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("checkpoint batch validation accepts matching trial IDs", () => {
  const originalBatch = [
    "TEST-BATCH-001",
    "TEST-BATCH-002",
    "TEST-BATCH-003",
  ];

  const recoveredBatch = [
    "TEST-BATCH-003",
    "TEST-BATCH-001",
    "TEST-BATCH-002",
  ];

  assert.equal(
    validateImportCheckpointBatch(originalBatch, recoveredBatch),
    true
  );
});

test("checkpoint batch validation rejects changed trial IDs", () => {
  const originalBatch = [
    "TEST-BATCH-001",
    "TEST-BATCH-002",
    "TEST-BATCH-003",
  ];

  const recoveredBatch = [
    "TEST-BATCH-001",
    "TEST-BATCH-002",
    "TEST-BATCH-004",
  ];

  assert.throws(
    () =>
      validateImportCheckpointBatch(
        originalBatch,
        recoveredBatch
      ),
    /Checkpoint batch mismatch: source case IDs have changed/
  );
});

test("checkpoint batch validation rejects missing trial IDs", () => {
  const originalBatch = [
    "TEST-BATCH-001",
    "TEST-BATCH-002",
    "TEST-BATCH-003",
  ];

  const recoveredBatch = [
    "TEST-BATCH-001",
    "TEST-BATCH-002",
  ];

  assert.throws(
    () =>
      validateImportCheckpointBatch(
        originalBatch,
        recoveredBatch
      ),
    /Checkpoint batch mismatch: source case IDs have changed/
  );
});

test("checkpoint batch validation rejects duplicate trial IDs", () => {
  const originalBatch = [
    "TEST-BATCH-001",
    "TEST-BATCH-002",
    "TEST-BATCH-002",
  ];

  const recoveredBatch = [
    "TEST-BATCH-001",
    "TEST-BATCH-002",
    "TEST-BATCH-002",
  ];

  assert.throws(
    () =>
      validateImportCheckpointBatch(
        originalBatch,
        recoveredBatch
      ),
    /Duplicate source case IDs in checkpoint batch/
  );
});

test("checkpoint batch validation rejects empty trial IDs", () => {
  const originalBatch = [
    "TEST-BATCH-001",
    "",
    "TEST-BATCH-003",
  ];

  const recoveredBatch = [
    "TEST-BATCH-001",
    "",
    "TEST-BATCH-003",
  ];

  assert.throws(
    () =>
      validateImportCheckpointBatch(
        originalBatch,
        recoveredBatch
      ),
    /Invalid source case ID in checkpoint batch/
  );
});

test("checkpoint batch validation rejects whitespace-only trial IDs", () => {
  const originalBatch = [
    "TEST-BATCH-001",
    "   ",
    "TEST-BATCH-003",
  ];

  const recoveredBatch = [
    "TEST-BATCH-001",
    "   ",
    "TEST-BATCH-003",
  ];

  assert.throws(
    () =>
      validateImportCheckpointBatch(
        originalBatch,
        recoveredBatch
      ),
    /Invalid source case ID in checkpoint batch/
  );
});

test("checkpoint batch validation rejects non-string trial IDs", () => {
  const originalBatch = [
    "TEST-BATCH-001",
    null,
    "TEST-BATCH-003",
  ];

  const recoveredBatch = [
    "TEST-BATCH-001",
    null,
    "TEST-BATCH-003",
  ];

  assert.throws(
    () =>
      validateImportCheckpointBatch(
        originalBatch,
        recoveredBatch
      ),
    /Invalid source case ID in checkpoint batch/
  );
});

test("checkpoint structure rejects malformed batch source IDs", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: "TEST-BATCH-001",
    processedTrials: [],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Invalid checkpoint batch source IDs/
  );
});

test("checkpoint structure rejects empty batch source IDs", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [
      "TEST-BATCH-001",
      "",
    ],
    processedTrials: [],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Invalid checkpoint batch source IDs/
  );
});

test("checkpoint structure rejects duplicate batch source IDs", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [
      "TEST-BATCH-001",
      "TEST-BATCH-002",
      "TEST-BATCH-002",
    ],
    processedTrials: [],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Duplicate checkpoint batch source IDs/
  );
});

test("checkpoint structure rejects processed trials outside the saved batch", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [
      "TEST-BATCH-001",
      "TEST-BATCH-002",
    ],
    processedTrials: [
      {
        source_case_id: "TEST-BATCH-003",
        status: "INSERTED",
      },
    ],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Processed trial is not in checkpoint batch/
  );
});

test("checkpoint structure rejects an empty recorded batch", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [],
    processedTrials: [],
  };

  assert.throws(
    () => validateImportCheckpointStructure(checkpoint),
    /Empty checkpoint batch source IDs/
  );
});

test("checkpoint completion rejects expected IDs that differ from the saved batch", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [
      "TEST-BATCH-001",
      "TEST-BATCH-002",
    ],
    processedTrials: [
      {
        source_case_id: "TEST-BATCH-001",
        status: "INSERTED",
      },
    ],
  };

  assert.throws(
    () =>
      completeImportCheckpoint(checkpoint, [
        "TEST-BATCH-001",
      ]),
    /Checkpoint batch mismatch: source case IDs have changed/
  );
});

test("checkpoint batch validation rejects empty batches", () => {
  assert.throws(
    () => validateImportCheckpointBatch([], []),
    /Empty checkpoint batch: source case IDs are required/
  );
});

test("import source ID validation accepts valid trial records", () => {
  const records = [
    {
      record: {
        source_case_id: "TEST-TRIAL-001",
      },
    },
    {
      record: {
        source_case_id: "TEST-TRIAL-002",
      },
    },
  ];

  assert.equal(
    validateImportSourceCaseIds(records),
    true
  );
});

test("import source ID validation rejects a missing source ID", () => {
  const records = [
    {
      record: {
        source_case_id: "TEST-TRIAL-001",
      },
    },
    {
      record: {
        source_case_id: null,
      },
    },
  ];

  assert.throws(
    () => validateImportSourceCaseIds(records),
    /Import blocked before insertion: 1 trial\(s\) missing source IDs/
  );
});

test("import source ID validation rejects whitespace-only IDs", () => {
  const records = [
    {
      record: {
        source_case_id: "TEST-TRIAL-001",
      },
    },
    {
      record: {
        source_case_id: "   ",
      },
    },
  ];

  assert.throws(
    () => validateImportSourceCaseIds(records),
    /Import blocked before insertion: 1 trial\(s\) missing source IDs/
  );
});

test("import source ID validation rejects non-array input", () => {
  assert.throws(
    () => validateImportSourceCaseIds(null),
    /Invalid import records: expected an array/
  );
});

test("completes, saves, and archives an import checkpoint", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-checkpoint-")
  );

  try {
    const checkpointPath = path.join(directory, "import.json");
    const archivePath = path.join(directory, "archive", "completed.json");

    const checkpoint = {
      identity: {
        version: 1,
        mode: "single-query",
        queries: ["robbery"],
        startOffset: 0,
        recordCount: 1,
        insertTrials: true,
      },
      status: "IN_PROGRESS",
      batchSourceCaseIds: ["t16751208-4"],
      processedTrials: [
        {
          source_case_id: "t16751208-4",
          status: "INSERTED",
          trialId: 123,
        },
      ],
    };

    await saveImportCheckpoint(checkpointPath, checkpoint);

    const completedCheckpoint = completeImportCheckpoint(
      checkpoint,
      ["t16751208-4"]
    );

    await saveImportCheckpoint(checkpointPath, completedCheckpoint);

    await archiveImportCheckpoint(checkpointPath, archivePath);

    const archivedCheckpoint = await loadImportCheckpoint(archivePath);

    assert.deepEqual(archivedCheckpoint, completedCheckpoint);
    assert.equal(archivedCheckpoint.status, "COMPLETED");

    const originalCheckpoint = await loadImportCheckpoint(checkpointPath);
    assert.equal(originalCheckpoint, null);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("recovery resumes only unfinished trials from a saved checkpoint", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-recovery-")
  );

  try {
    const checkpointPath = path.join(directory, "checkpoint.json");

    const batchSourceCaseIds = [
      "TEST-RECOVERY-001",
      "TEST-RECOVERY-002",
      "TEST-RECOVERY-003",
    ];

    const checkpoint = {
      identity: createImportCheckpointIdentity({
        mode: "single-query",
        queries: ["robbery"],
        startOffset: 0,
        recordCount: 3,
        insertTrials: true,
      }),
      status: "IN_PROGRESS",
      batchSourceCaseIds,
      processedTrials: [
        {
          source_case_id: "TEST-RECOVERY-001",
          status: "INSERTED",
          trialId: 101,
        },
        {
          source_case_id: "TEST-RECOVERY-002",
          status: "FAILED",
          errors: ["Temporary database error"],
        },
      ],
    };

    await saveImportCheckpoint(checkpointPath, checkpoint);

    const recoveredCheckpoint = await loadImportCheckpoint(
      checkpointPath
    );

    assert.equal(
      validateImportCheckpointStructure(recoveredCheckpoint),
      true
    );

    assert.equal(
      validateImportCheckpointIdentity(
        recoveredCheckpoint.identity,
        checkpoint.identity
      ),
      true
    );

    assert.equal(
      validateImportCheckpointBatch(
        recoveredCheckpoint.batchSourceCaseIds,
        batchSourceCaseIds
      ),
      true
    );

    const trialsToRetry = batchSourceCaseIds.filter((sourceCaseId) =>
      shouldRetryImportTrial(recoveredCheckpoint, sourceCaseId)
    );

    assert.deepEqual(trialsToRetry, [
      "TEST-RECOVERY-002",
      "TEST-RECOVERY-003",
    ]);

    assert.equal(recoveredCheckpoint.status, "IN_PROGRESS");
  } finally {
    await fs.rm(directory, {
      recursive: true,
      force: true,
    });
  }
});