const REVIEWED_HISTORICAL_LOCATIONS = {
  "t17700530-48": {
    crimeLocation: "Edmonton",
    locationSource: "narrative_reviewed",
    locationPrecision: "named_place",
  },
};

export function getReviewedHistoricalLocation(
  sourceCaseId
) {
  if (!sourceCaseId) {
    return null;
  }

  return (
    REVIEWED_HISTORICAL_LOCATIONS[
      sourceCaseId
    ] ?? null
  );
}