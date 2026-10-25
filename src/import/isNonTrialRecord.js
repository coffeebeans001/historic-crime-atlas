
export function isNonTrialRecord(record) {
  const title =
    record?._source?.title?.toLowerCase() ?? "";

  return (
    title.startsWith("front matter") ||
    title.startsWith("punishment summary") ||
    title.startsWith("supplementary material") ||
    title.startsWith("advertisements")
  );
}
