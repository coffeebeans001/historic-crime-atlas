import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  saveImportCheckpoint,
  loadImportCheckpoint,
} from "../src/import/importCheckpoint.js";

import test from "node:test";
import assert from "node:assert/strict";

import {
  selectTrialsForRecovery,
} from "../src/import/importRecovery.js";

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