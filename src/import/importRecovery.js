import {
  shouldRetryImportTrial,
  validateImportCheckpointStructure,
  validateImportSourceCaseIds,
  validateImportCheckpointBatch,
} from "./importCheckpoint.js";

export function selectTrialsForRecovery(
  resolvedRelationshipRecords,
  checkpoint
) {
  if (!Array.isArray(resolvedRelationshipRecords)) {
    throw new Error(
      "Invalid recovery records: expected an array"
    );
  }

  validateRecoveryCheckpoint(checkpoint);
  validateImportSourceCaseIds(resolvedRelationshipRecords);

const recoveredBatchSourceCaseIds =
  resolvedRelationshipRecords.map(
    (item) => item.record.source_case_id
  );

  validateImportCheckpointBatch(
    checkpoint.batchSourceCaseIds,
    recoveredBatchSourceCaseIds
 );

  return resolvedRelationshipRecords.filter((item) => {
    const sourceCaseId = item?.record?.source_case_id;

    return shouldRetryImportTrial(
      checkpoint,
      sourceCaseId
    );
  });
}

function validateRecoveryCheckpoint(checkpoint) {
  validateImportCheckpointStructure(checkpoint);

  if (!Array.isArray(checkpoint.batchSourceCaseIds)) {
    throw new Error(
      "Import recovery blocked: checkpoint has no recorded batch identity"
    );
  }
}