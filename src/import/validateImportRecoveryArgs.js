export function validateImportRecoveryArgs({
  insertTrials,
  resumeImport,
}) {
  if (resumeImport && !insertTrials) {
    throw new Error(
      "--resume requires --insert-trials"
    );
  }

  if (resumeImport) {
    throw new Error(
      "Import recovery is not enabled yet"
    );
  }

  return true;
}