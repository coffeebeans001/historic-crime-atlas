import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  saveImportCheckpoint,
  loadImportCheckpoint,
  recordImportTrialResult,
} from "../src/import/importCheckpoint.js";

import test from "node:test";
import assert from "node:assert/strict";

import {
  selectTrialsForRecovery,
} from "../src/import/importRecovery.js";

import {
  importResolvedTrials,
} from "../src/import/trialImporter.js";

test("recovery rejects a completed checkpoint", () => {
  const sourceCaseIds = [
    "TEST-COMPLETED-001",
    "TEST-COMPLETED-002",
  ];

  const resolvedRelationshipRecords = sourceCaseIds.map(
    (sourceCaseId, index) => ({
      rowNumber: index + 1,
      record: {
        source_case_id: sourceCaseId,
      },
    })
  );

  const checkpoint = {
    status: "COMPLETED",
    batchSourceCaseIds: sourceCaseIds,
    processedTrials: [
      {
        source_case_id: "TEST-COMPLETED-001",
        status: "INSERTED",
      },
      {
        source_case_id: "TEST-COMPLETED-002",
        status: "FAILED",
      },
    ],
  };

  assert.throws(
    () =>
      selectTrialsForRecovery(
        resolvedRelationshipRecords,
        checkpoint
      ),
    /Import recovery blocked: checkpoint is already completed/
  );
});

test("recovery selects only unfinished trials", () => {
  const sourceCaseIds = [
    "TEST-RECOVERY-001",
    "TEST-RECOVERY-002",
    "TEST-RECOVERY-003",
    "TEST-RECOVERY-004",
    "TEST-RECOVERY-005",
  ];

  const resolvedRelationshipRecords = sourceCaseIds.map(
    (sourceCaseId, index) => ({
      rowNumber: index + 1,
      record: {
        source_case_id: sourceCaseId,
      },
    })
  );

  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: sourceCaseIds,
    processedTrials: [
      {
        source_case_id: "TEST-RECOVERY-001",
        status: "INSERTED",
      },
      {
        source_case_id: "TEST-RECOVERY-002",
        status: "DATABASE_DUPLICATE",
      },
      {
        source_case_id: "TEST-RECOVERY-003",
        status: "FAILED",
      },
      {
        source_case_id: "TEST-RECOVERY-004",
        status: "UNRESOLVED",
      },
    ],
  };

  const selectedTrials = selectTrialsForRecovery(
    resolvedRelationshipRecords,
    checkpoint
  );

  assert.deepEqual(
    selectedTrials.map((item) => item.record.source_case_id),
    [
      "TEST-RECOVERY-003",
      "TEST-RECOVERY-004",
      "TEST-RECOVERY-005",
    ]
  );
});

test("recovery rejects a mismatched batch before selecting trials", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [
      "TEST-RECOVERY-001",
      "TEST-RECOVERY-002",
    ],
    processedTrials: [
      {
        source_case_id: "TEST-RECOVERY-001",
        status: "INSERTED",
      },
    ],
  };

  const resolvedRelationshipRecords = [
    {
      record: {
        source_case_id: "TEST-RECOVERY-001",
      },
    },
    {
      record: {
        source_case_id: "TEST-RECOVERY-999",
      },
    },
  ];

  assert.throws(
    () =>
      selectTrialsForRecovery(
        resolvedRelationshipRecords,
        checkpoint
      ),
    /Checkpoint batch mismatch: source case IDs have changed/
  );
});

test("recovery rejects trials with missing source IDs", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [
      "TEST-RECOVERY-001",
      "TEST-RECOVERY-002",
    ],
    processedTrials: [],
  };

  const resolvedRelationshipRecords = [
    {
      record: {
        source_case_id: "TEST-RECOVERY-001",
      },
    },
    {
      record: {
        source_case_id: "",
      },
    },
  ];

  assert.throws(
    () =>
      selectTrialsForRecovery(
        resolvedRelationshipRecords,
        checkpoint
      ),
    /Import blocked before insertion: 1 trial\(s\) missing source IDs/
  );
});

test("recovery rejects a checkpoint without batch identity", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    processedTrials: [
      {
        source_case_id: "TEST-RECOVERY-001",
        status: "FAILED",
      },
    ],
  };

  const resolvedRelationshipRecords = [
    {
      record: {
        source_case_id: "TEST-RECOVERY-001",
      },
    },
  ];

  assert.throws(
    () =>
      selectTrialsForRecovery(
        resolvedRelationshipRecords,
        checkpoint
      ),
    /Import recovery blocked: checkpoint has no recorded batch identity/
  );
});

test("recovery rejects duplicate source IDs", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [
      "TEST-RECOVERY-001",
      "TEST-RECOVERY-002",
    ],
    processedTrials: [],
  };

  const resolvedRelationshipRecords = [
    {
      record: {
        source_case_id: "TEST-RECOVERY-001",
      },
    },
    {
      record: {
        source_case_id: "TEST-RECOVERY-001",
      },
    },
  ];

  assert.throws(
    () =>
      selectTrialsForRecovery(
        resolvedRelationshipRecords,
        checkpoint
      ),
    /duplicate/i
  );
});

test("recovery rejects a malformed checkpoint", () => {
  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [
      "TEST-RECOVERY-001",
    ],
    processedTrials: "INVALID",
  };

  const resolvedRelationshipRecords = [
    {
      record: {
        source_case_id: "TEST-RECOVERY-001",
      },
    },
  ];

  assert.throws(
    () =>
      selectTrialsForRecovery(
        resolvedRelationshipRecords,
        checkpoint
      ),
    /Invalid import checkpoint structure/
  );
});

test("recovery preserves the original order of unfinished trials", () => {
  const sourceCaseIds = [
    "TEST-ORDER-001",
    "TEST-ORDER-002",
    "TEST-ORDER-003",
    "TEST-ORDER-004",
  ];

  const resolvedRelationshipRecords = sourceCaseIds.map(
    (sourceCaseId) => ({
      record: {
        source_case_id: sourceCaseId,
      },
    })
  );

  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: sourceCaseIds,
    processedTrials: [
      {
        source_case_id: "TEST-ORDER-001",
        status: "INSERTED",
      },
      {
        source_case_id: "TEST-ORDER-003",
        status: "FAILED",
      },
    ],
  };

  const selectedTrials = selectTrialsForRecovery(
    resolvedRelationshipRecords,
    checkpoint
  );

  assert.deepEqual(
    selectedTrials.map((item) => item.record.source_case_id),
    [
      "TEST-ORDER-002",
      "TEST-ORDER-003",
      "TEST-ORDER-004",
    ]
  );
});

test("recovery selects unfinished trials from a saved checkpoint", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-recovery-module-")
  );

  try {
    const checkpointPath = path.join(directory, "checkpoint.json");

    const sourceCaseIds = [
      "TEST-PERSIST-001",
      "TEST-PERSIST-002",
      "TEST-PERSIST-003",
    ];

    const checkpoint = {
      status: "IN_PROGRESS",
      batchSourceCaseIds: sourceCaseIds,
      processedTrials: [
        {
          source_case_id: "TEST-PERSIST-001",
          status: "INSERTED",
          trialId: 101,
        },
        {
          source_case_id: "TEST-PERSIST-002",
          status: "FAILED",
          errors: ["Temporary database error"],
        },
      ],
    };

    await saveImportCheckpoint(checkpointPath, checkpoint);

    const recoveredCheckpoint = await loadImportCheckpoint(
      checkpointPath
    );

    const resolvedRelationshipRecords = sourceCaseIds.map(
      (sourceCaseId) => ({
        record: {
          source_case_id: sourceCaseId,
        },
      })
    );

    const selectedTrials = selectTrialsForRecovery(
      resolvedRelationshipRecords,
      recoveredCheckpoint
    );

    assert.deepEqual(
      selectedTrials.map((item) => item.record.source_case_id),
      [
        "TEST-PERSIST-002",
        "TEST-PERSIST-003",
      ]
    );
  } finally {
    await fs.rm(directory, {
      recursive: true,
      force: true,
    });
  }
});

function createSimulatedTrialDatabase({
  failAfterCommit = false,
} = {}) {
  const committedTrials = new Map();
  let nextTrialId = 101;
  let insertCount = 0;

  const connectionPool = {
    async getConnection() {
      let pendingTrial = null;

      return {
        async beginTransaction() {
          pendingTrial = null;
        },

        async execute(sql, params) {
          if (
            /SELECT\s+id,\s+source_case_id\s+FROM\s+trials/i.test(sql)
          ) {
            const sourceCaseId = params[0];
            const existingTrial = committedTrials.get(sourceCaseId);

            return [existingTrial ? [existingTrial] : []];
          }

          if (/INSERT\s+INTO\s+trials/i.test(sql)) {
            const sourceCaseId = params[0];

            if (committedTrials.has(sourceCaseId)) {
              const error = new Error("Duplicate trial");
              error.code = "ER_DUP_ENTRY";
              error.errno = 1062;
              throw error;
            }

            const trialId = nextTrialId++;

            pendingTrial = {
              id: trialId,
              source_case_id: sourceCaseId,
            };

            insertCount++;

            return [{ insertId: trialId }];
          }

          throw new Error("Unexpected SQL query");
        },

async commit() {
  if (pendingTrial) {
    committedTrials.set(
      pendingTrial.source_case_id,
      pendingTrial
    );
  }

  pendingTrial = null;

  if (failAfterCommit) {
    throw new Error(
      "Simulated connection failure after commit"
    );
  }
},

async rollback() {
          pendingTrial = null;
        },

        release() {},
      };
    },
  };

  return {
    connectionPool,
    committedTrials,
    getInsertCount: () => insertCount,
  };
}

test("recovery avoids duplicate insertion after uncertain commit", async () => {
  const sourceCaseId = "TEST-UNCERTAIN-COMMIT-001";

  const trial = {
    rowNumber: 1,
    record: {
      source_case_id: sourceCaseId,
      trial_date: "1674-04-29",
    },
    defendant: null,
    judge: null,
    offence: null,
    missingReferences: [],
  };

  const database = createSimulatedTrialDatabase({
    failAfterCommit: true,
  });

  const importOptions = {
    connectionPool: database.connectionPool,
    allowMissingDefendant: true,
    allowMissingJudge: true,
    allowMissingOffence: true,
  };

  const firstResults = await importResolvedTrials(
    [trial],
    importOptions
  );

  assert.equal(firstResults[0].status, "FAILED");
  assert.equal(database.committedTrials.size, 1);
  assert.equal(database.getInsertCount(), 1);

  const checkpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: [sourceCaseId],
    processedTrials: [
      {
        source_case_id: sourceCaseId,
        status: "FAILED",
      },
    ],
  };

  const selectedTrials = selectTrialsForRecovery(
    [trial],
    checkpoint
  );

  assert.equal(selectedTrials.length, 1);

  const recoveryResults = await importResolvedTrials(
    selectedTrials,
    importOptions
  );

  assert.equal(
    recoveryResults[0].status,
    "DATABASE_DUPLICATE"
  );

  assert.equal(
    recoveryResults[0].existingTrialId,
    101
  );

  assert.equal(database.committedTrials.size, 1);
  assert.equal(database.getInsertCount(), 1);
});

test("interrupted import recovers without duplicate insertions", async () => {
  const sourceCaseIds = [
    "TEST-INTERRUPT-001",
    "TEST-INTERRUPT-002",
    "TEST-INTERRUPT-003",
  ];

  const resolvedRelationshipRecords = sourceCaseIds.map(
    (sourceCaseId, index) => ({
      rowNumber: index + 1,
      record: {
        source_case_id: sourceCaseId,
        trial_date: "1700-01-01",
        defendant_name: `Test Defendant ${index + 1}`,
        offence: "Test offence",
        verdict: "Guilty",
        source_url: `https://example.com/${sourceCaseId}`,
      },
      defendant: null,
      judge: null,
      offence: null,
      missingReferences: [],
    })
  );

  assert.equal(resolvedRelationshipRecords.length, 3);
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "old-bailey-interrupted-import-")
  );

  const checkpointPath = path.join(directory, "checkpoint.json");
    try {

  const initialCheckpoint = {
    status: "IN_PROGRESS",
    batchSourceCaseIds: sourceCaseIds,
    processedTrials: [],
 };

 await saveImportCheckpoint(
   checkpointPath,
   initialCheckpoint
 );

 const savedCheckpoint = await loadImportCheckpoint(
   checkpointPath
 );

 assert.deepEqual(savedCheckpoint, initialCheckpoint);
 
 const simulatedDatabase = createSimulatedTrialDatabase();

 const firstTrialResults = await importResolvedTrials(
   [resolvedRelationshipRecords[0]],
  {
    allowMissingDefendant: true,
    allowMissingJudge: true,
    allowMissingOffence: true,
    connectionPool: simulatedDatabase.connectionPool,
   }
 );

 assert.equal(firstTrialResults.length, 1);
 assert.equal(firstTrialResults[0].status, "INSERTED");

 assert.equal(
   simulatedDatabase.committedTrials.size,
   1
 );

 assert.equal(
   simulatedDatabase.getInsertCount(),
   1
 );

 const checkpointAfterFirstTrial = recordImportTrialResult(
  savedCheckpoint,
  firstTrialResults[0]
);

await saveImportCheckpoint(
  checkpointPath,
  checkpointAfterFirstTrial
);

const reloadedCheckpoint = await loadImportCheckpoint(
  checkpointPath
);

assert.equal(reloadedCheckpoint.processedTrials.length, 1);

assert.deepEqual(
  reloadedCheckpoint.processedTrials[0],
  {
    source_case_id: "TEST-INTERRUPT-001",
    status: "INSERTED",
    trialId: 101,
    existingTrialId: null,
    errors: [],
  }
);

const secondTrialResults = await importResolvedTrials(
  [resolvedRelationshipRecords[1]],
  {
    allowMissingDefendant: true,
    allowMissingJudge: true,
    allowMissingOffence: true,
    connectionPool: simulatedDatabase.connectionPool,
  }
);

assert.equal(secondTrialResults.length, 1);
assert.equal(secondTrialResults[0].status, "INSERTED");
assert.equal(secondTrialResults[0].trialId, 102);

assert.equal(
  simulatedDatabase.committedTrials.size,
  2
);

assert.equal(
  simulatedDatabase.getInsertCount(),
  2
);

const simulateCheckpointFailure = async (result) => {
  const updatedCheckpoint = recordImportTrialResult(
    reloadedCheckpoint,
    result
  );

  assert.equal(updatedCheckpoint.processedTrials.length, 2);

  throw new Error("Simulated checkpoint write failure");
};

await assert.rejects(
  simulateCheckpointFailure(secondTrialResults[0]),
  /Simulated checkpoint write failure/
);

const checkpointAfterInterruption =
  await loadImportCheckpoint(checkpointPath);

assert.equal(
  checkpointAfterInterruption.processedTrials.length,
  1
);

assert.equal(
  checkpointAfterInterruption.processedTrials[0].source_case_id,
  "TEST-INTERRUPT-001"
);

assert.equal(
  simulatedDatabase.committedTrials.size,
  2
);

const trialsSelectedForRecovery = selectTrialsForRecovery(
  resolvedRelationshipRecords,
  checkpointAfterInterruption
);

assert.deepEqual(
  trialsSelectedForRecovery.map(
    (item) => item.record.source_case_id
  ),
  [
    "TEST-INTERRUPT-002",
    "TEST-INTERRUPT-003",
  ]
);

const recoveryResults = await importResolvedTrials(
  trialsSelectedForRecovery,
  {
    allowMissingDefendant: true,
    allowMissingJudge: true,
    allowMissingOffence: true,
    connectionPool: simulatedDatabase.connectionPool,
  }
);

assert.deepEqual(
  recoveryResults.map((result) => result.status),
  ["DATABASE_DUPLICATE", "INSERTED"]
);

assert.equal(recoveryResults[0].existingTrialId, 102);
assert.equal(recoveryResults[1].trialId, 103);

assert.equal(
  simulatedDatabase.committedTrials.size,
  3
);

assert.equal(
  simulatedDatabase.getInsertCount(),
  3
);

let recoveredCheckpoint = checkpointAfterInterruption;

for (const result of recoveryResults) {
  recoveredCheckpoint = recordImportTrialResult(
    recoveredCheckpoint,
    result
  );

  await saveImportCheckpoint(
    checkpointPath,
    recoveredCheckpoint
  );
}

const finalCheckpoint = await loadImportCheckpoint(
  checkpointPath
);

assert.deepEqual(
  finalCheckpoint.processedTrials.map(
    (trial) => trial.status
  ),
  ["INSERTED", "DATABASE_DUPLICATE", "INSERTED"]
);

assert.equal(finalCheckpoint.processedTrials.length, 3);

 } finally {
    await fs.rm(directory, {
      recursive: true,
      force: true,
  });
 }
});

test("repeated recovery avoids duplicate trial insertions", async () => {
  const sourceCaseIds = [
    "TEST-REPEAT-001",
    "TEST-REPEAT-002",
  ];

  const resolvedRelationshipRecords = sourceCaseIds.map(
    (sourceCaseId, index) => ({
      rowNumber: index + 1,
      record: {
        source_case_id: sourceCaseId,
        trial_date: "1700-01-01",
        defendant_name: `Test Defendant ${index + 1}`,
        offence: "Test offence",
        verdict: "Guilty",
        source_url: `https://example.com/${sourceCaseId}`,
      },
      defendant: null,
      judge: null,
      offence: null,
      missingReferences: [],
    })
  );

  assert.equal(resolvedRelationshipRecords.length, 2);
  const simulatedDatabase = createSimulatedTrialDatabase();

  const importOptions = {
    allowMissingDefendant: true,
    allowMissingJudge: true,
    allowMissingOffence: true,
    connectionPool: simulatedDatabase.connectionPool,
    };

    let checkpoint = {
      status: "IN_PROGRESS",
      batchSourceCaseIds: sourceCaseIds,
      processedTrials: [
        {
        source_case_id: "TEST-REPEAT-002",
        status: "FAILED",
        },
     ],
    };

    assert.equal(simulatedDatabase.committedTrials.size, 0);
    assert.equal(checkpoint.processedTrials.length, 1);

    const initialResults = await importResolvedTrials(
      [resolvedRelationshipRecords[0]],
      importOptions
    );

    assert.equal(initialResults.length, 1);
    assert.equal(initialResults[0].status, "INSERTED");

    checkpoint = recordImportTrialResult(
      checkpoint,
      initialResults[0]
    );

    assert.equal(simulatedDatabase.committedTrials.size, 1);
    assert.equal(simulatedDatabase.getInsertCount(), 1);

    assert.equal(checkpoint.processedTrials.length, 2);

    const firstRecoverySelection = selectTrialsForRecovery(
      resolvedRelationshipRecords,
      checkpoint
    );

    assert.deepEqual(
    firstRecoverySelection.map(
        (item) => item.record.source_case_id
    ),
    ["TEST-REPEAT-002"]
    );

    const firstRecoveryResults = await importResolvedTrials(
    firstRecoverySelection,
    importOptions
    );

    assert.equal(firstRecoveryResults.length, 1);
    assert.equal(firstRecoveryResults[0].status, "INSERTED");

    checkpoint = recordImportTrialResult(
    checkpoint,
    firstRecoveryResults[0]
    );

    assert.equal(simulatedDatabase.committedTrials.size, 2);
    assert.equal(simulatedDatabase.getInsertCount(), 2);

    assert.equal(checkpoint.processedTrials.length, 2);

    assert.deepEqual(
    checkpoint.processedTrials.map((trial) => trial.status),
    ["INSERTED", "INSERTED"]
    );

    const secondRecoverySelection = selectTrialsForRecovery(
    resolvedRelationshipRecords,
    checkpoint
    );

    assert.deepEqual(secondRecoverySelection, []);

    const secondRecoveryResults = await importResolvedTrials(
    secondRecoverySelection,
    importOptions
    );

    assert.deepEqual(secondRecoveryResults, []);

    assert.equal(simulatedDatabase.committedTrials.size, 2);
    assert.equal(simulatedDatabase.getInsertCount(), 2);

    assert.equal(checkpoint.processedTrials.length, 2);
});
