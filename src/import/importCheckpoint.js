import { promises as fs } from "node:fs";
import { constants } from "node:fs";
import path from "node:path";

export async function saveImportCheckpoint(
  checkpointPath,
  checkpoint
) {
  const directory = path.dirname(checkpointPath);
  const temporaryPath = `${checkpointPath}.tmp`;

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(
      temporaryPath,
      JSON.stringify(checkpoint, null, 2),
      "utf8"
    );

    await fs.rename(temporaryPath, checkpointPath);
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch {
      // Temporary file may not exist.
    }

    throw error;
  }
}

export async function loadImportCheckpoint(checkpointPath) {
  try {
    const content = await fs.readFile(checkpointPath, "utf8");

    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export function createImportCheckpointIdentity({
  mode,
  queries,
  startOffset,
  recordCount,
  insertTrials,
}) {
  return {
    version: 1,
    mode,
    queries,
    startOffset,
    recordCount,
    insertTrials,
  };
}

export function validateImportCheckpointIdentity(
  savedIdentity,
  expectedIdentity
) {
  const fields = [
    "version",
    "mode",
    "queries",
    "startOffset",
    "recordCount",
    "insertTrials",
  ];

  for (const field of fields) {
    if (
      JSON.stringify(savedIdentity?.[field]) !==
      JSON.stringify(expectedIdentity?.[field])
    ) {
      throw new Error(
        `Checkpoint identity mismatch: ${field}`
      );
    }
  }

  return true;
}

const VALID_IMPORT_STATUSES = new Set([
  "INSERTED",
  "DATABASE_DUPLICATE",
  "UNRESOLVED",
  "FAILED",
]);

const VALID_CHECKPOINT_STATUSES = new Set([
  "IN_PROGRESS",
  "COMPLETED",
]);

export function validateImportCheckpointStructure(checkpoint) {
  if (
    !checkpoint ||
    typeof checkpoint !== "object" ||
    Array.isArray(checkpoint) ||
    !Array.isArray(checkpoint.processedTrials)
  ) {
    throw new Error("Invalid import checkpoint structure");
  }

  if (!VALID_CHECKPOINT_STATUSES.has(checkpoint.status)) {
    throw new Error(
      `Invalid checkpoint lifecycle status: ${checkpoint.status}`
    );
  }

  if (
    checkpoint.batchSourceCaseIds !== undefined &&
    checkpoint.batchSourceCaseIds !== null &&
    !Array.isArray(checkpoint.batchSourceCaseIds)
  ) {
    throw new Error("Invalid checkpoint batch source IDs");
  }

  if (
    Array.isArray(checkpoint.batchSourceCaseIds) &&
    checkpoint.batchSourceCaseIds.length === 0
  ) {
    throw new Error("Empty checkpoint batch source IDs");
  }

  if (
  Array.isArray(checkpoint.batchSourceCaseIds) &&
  checkpoint.batchSourceCaseIds.some(
    (sourceCaseId) =>
      typeof sourceCaseId !== "string" ||
      sourceCaseId.trim() === ""
  )
  ) {
    throw new Error("Invalid checkpoint batch source IDs");
  }

  if (
    Array.isArray(checkpoint.batchSourceCaseIds) &&
    new Set(checkpoint.batchSourceCaseIds).size !==
      checkpoint.batchSourceCaseIds.length
  ) {
    throw new Error("Duplicate checkpoint batch source IDs");
  }

  const seenSourceCaseIds = new Set();

  for (const trial of checkpoint.processedTrials) {
    if (
      !trial ||
      typeof trial !== "object" ||
      Array.isArray(trial) ||
      typeof trial.source_case_id !== "string" ||
      trial.source_case_id.trim() === "" ||
      typeof trial.status !== "string" ||
      trial.status.trim() === ""
    ) {
      throw new Error("Invalid checkpoint trial entry");
    }

    if (!VALID_IMPORT_STATUSES.has(trial.status)) {
      throw new Error(
        `Invalid checkpoint trial status: ${trial.status}`
     );
    }

    if (seenSourceCaseIds.has(trial.source_case_id)) {
      throw new Error(
        `Duplicate checkpoint source ID: ${trial.source_case_id}`
     );
    }
    
    if (
      Array.isArray(checkpoint.batchSourceCaseIds) &&
      !checkpoint.batchSourceCaseIds.includes(trial.source_case_id)
    ) {
      throw new Error(
        "Processed trial is not in checkpoint batch"
      );
    }

    seenSourceCaseIds.add(trial.source_case_id);
  }

  return true;
}

export function recordImportTrialResult(checkpoint, result) {
  const sourceCaseId = result.record?.source_case_id;

  if (!sourceCaseId) {
    throw new Error(
      "Cannot checkpoint a trial without source_case_id"
    );
  }

  const processedTrials = [...(checkpoint.processedTrials ?? [])];

  const updatedResult = {
    source_case_id: sourceCaseId,
    status: result.status,
    trialId: result.trialId ?? null,
    existingTrialId: result.existingTrialId ?? null,
    errors: result.errors ?? [],
  };

  const existingIndex = processedTrials.findIndex(
    (trial) => trial.source_case_id === sourceCaseId
  );

  if (existingIndex >= 0) {
    processedTrials[existingIndex] = updatedResult;
  } else {
    processedTrials.push(updatedResult);
  }

  return {
    ...checkpoint,
    processedTrials,
  };
}

export function shouldRetryImportTrial(checkpoint, sourceCaseId) {
  const processedTrial = (checkpoint?.processedTrials ?? []).find(
    (trial) => trial.source_case_id === sourceCaseId
  );

  if (!processedTrial) {
    return true;
  }

  return !["INSERTED", "DATABASE_DUPLICATE"].includes(
    processedTrial.status
  );
}

  export function completeImportCheckpoint(
    checkpoint,
    expectedSourceCaseIds
    ) {
    validateImportCheckpointStructure(checkpoint);

    if (
      !Array.isArray(expectedSourceCaseIds) ||
      expectedSourceCaseIds.length === 0
    ) {
        throw new Error("Expected source ID list is required");
    }

    if (Array.isArray(checkpoint.batchSourceCaseIds)) {
      validateImportCheckpointBatch(
        checkpoint.batchSourceCaseIds,
        expectedSourceCaseIds
      );
    }

    if (checkpoint.processedTrials.length === 0) {
      throw new Error("Cannot complete an empty checkpoint");
    }

    if (expectedSourceCaseIds.length > 0) {
    const processedSourceIds = new Set(
      checkpoint.processedTrials.map(
        (trial) => trial.source_case_id
      )
    );

    const missingSourceIds = expectedSourceCaseIds.filter(
      (sourceCaseId) => !processedSourceIds.has(sourceCaseId)
    );

    if (missingSourceIds.length > 0) {
      throw new Error(
        `Cannot complete checkpoint: ${missingSourceIds.length} expected trial(s) missing`
      );
    }

    const expectedSourceIds = new Set(expectedSourceCaseIds);

    const unexpectedSourceIds = checkpoint.processedTrials.filter(
      (trial) => !expectedSourceIds.has(trial.source_case_id)
    );

    if (unexpectedSourceIds.length > 0) {
      throw new Error(
        `Cannot complete checkpoint: ${unexpectedSourceIds.length} unexpected trial(s)`
      );
    }
  }

  const unfinishedTrials = checkpoint.processedTrials.filter(
    (trial) =>
      !["INSERTED", "DATABASE_DUPLICATE"].includes(trial.status)
  );

  if (unfinishedTrials.length > 0) {
    throw new Error(
      `Cannot complete checkpoint: ${unfinishedTrials.length} unfinished trial(s)`
    );
  }

  return {
    ...checkpoint,
    status: "COMPLETED",
  };
}

export async function archiveImportCheckpoint(
  checkpointPath,
  archivePath
) {
  const checkpoint = await loadImportCheckpoint(checkpointPath);

  if (!checkpoint) {
    throw new Error("Cannot archive checkpoint: file does not exist");
  }

  validateImportCheckpointStructure(checkpoint);

  if (checkpoint.status !== "COMPLETED") {
    throw new Error(
      "Cannot archive checkpoint: checkpoint is not completed"
    );
  }

  await fs.mkdir(path.dirname(archivePath), {
    recursive: true,
  });

  await fs.copyFile(
    checkpointPath,
    archivePath,
    constants.COPYFILE_EXCL
  );

  await fs.unlink(checkpointPath);

  return archivePath;
}

export function validateImportCheckpointBatch(
  originalBatch,
  recoveredBatch
) {
  if (
    !Array.isArray(originalBatch) ||
    !Array.isArray(recoveredBatch)
  ) {
    throw new Error(
      "Invalid checkpoint batch: expected arrays of source case IDs"
    );
  }

  if (
    originalBatch.length === 0 ||
    recoveredBatch.length === 0
  ) {
    throw new Error(
      "Empty checkpoint batch: source case IDs are required"
    );
  }

    const hasInvalidSourceCaseId = (batch) =>
    batch.some(
      (sourceCaseId) =>
        typeof sourceCaseId !== "string" ||
        sourceCaseId.trim() === ""
    );

    if (
      hasInvalidSourceCaseId(originalBatch) ||
      hasInvalidSourceCaseId(recoveredBatch)
    ) {
      throw new Error(
        "Invalid source case ID in checkpoint batch"
      );
    }

    if (
    new Set(originalBatch).size !== originalBatch.length ||
    new Set(recoveredBatch).size !== recoveredBatch.length
  ) {
    throw new Error(
      "Duplicate source case IDs in checkpoint batch"
    );
  }

  const originalIds = [...originalBatch].sort();
  const recoveredIds = [...recoveredBatch].sort();

  if (JSON.stringify(originalIds) !== JSON.stringify(recoveredIds)) {
    throw new Error(
      "Checkpoint batch mismatch: source case IDs have changed"
    );
  }

  return true;
}

export function validateImportSourceCaseIds(records) {
  if (!Array.isArray(records)) {
    throw new Error(
      "Invalid import records: expected an array"
    );
  }

  const missingSourceIds = records.filter((item) => {
    const sourceCaseId = item?.record?.source_case_id;

    return (
      typeof sourceCaseId !== "string" ||
      sourceCaseId.trim() === ""
    );
  });

  if (missingSourceIds.length > 0) {
    throw new Error(
      `Import blocked before insertion: ${missingSourceIds.length} trial(s) missing source IDs`
    );
  }

  return true;
}