/**
 * Detects duplicate records using source_case_id.
 *
 * The first occurrence is retained as unique.
 * Any later occurrence of the same source_case_id is marked as a duplicate.
 *
 * @param {Array<{
 *   rowNumber: number,
 *   record: Record<string, unknown>,
 *   isValid: boolean,
 *   errors: string[]
 * }>} validationResults
 *
 * @returns {{
 *   uniqueRecords: Array<{
 *     rowNumber: number,
 *     record: Record<string, unknown>
 *   }>,
 *   duplicateRecords: Array<{
 *     rowNumber: number,
 *     record: Record<string, unknown>,
 *     duplicateOfRow: number,
 *     duplicateKey: string
 *   }>
 * }}
 */
export function detectDuplicates(validationResults) {
  const seenSourceIds = new Map();
  const uniqueRecords = [];
  const duplicateRecords = [];

  validationResults
    .filter((result) => result.isValid)
    .forEach((result) => {
      const sourceCaseId = result.record.source_case_id;

      if (!seenSourceIds.has(sourceCaseId)) {
        seenSourceIds.set(sourceCaseId, result.rowNumber);

        uniqueRecords.push({
          rowNumber: result.rowNumber,
          record: result.record,
        });

        return;
      }

      duplicateRecords.push({
        rowNumber: result.rowNumber,
        record: result.record,
        duplicateOfRow: seenSourceIds.get(sourceCaseId),
        duplicateKey: sourceCaseId,
      });
    });

  return {
    uniqueRecords,
    duplicateRecords,
  };
}