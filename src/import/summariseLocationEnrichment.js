export function summariseLocationEnrichment(records = []) {
  const totalRecords = records.length;

  const mappedRecords = records.filter(
    (record) =>
      record.latitude != null &&
      record.longitude != null
  ).length;

  const unmappedRecords =
    totalRecords - mappedRecords;

  const coveragePercentage =
    totalRecords > 0
      ? Number(
          (
            (mappedRecords / totalRecords) *
            100
          ).toFixed(1)
        )
      : 0;

  const structuredXmlRecords = records.filter(
    (record) =>
        record.location_source === "structured_xml"
    ).length;

  const narrativeReviewedRecords = records.filter(
    (record) =>
        record.location_source === "narrative_reviewed"
    ).length;
    
    const approximateGeocodes = records.filter(
  (record) =>
    record.geocode_confidence ===
    "approximate"
).length;

  return {
    totalRecords,
    mappedRecords,
    unmappedRecords,
    coveragePercentage,
    structuredXmlRecords,
    narrativeReviewedRecords,
    approximateGeocodes
  };
}