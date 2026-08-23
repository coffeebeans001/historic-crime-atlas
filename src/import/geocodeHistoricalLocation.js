function normalizeLocationName(value) {
  return value
    ?.toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") ?? "";
}

const HISTORICAL_LOCATION_COORDINATES = {
  hounslow: {
    latitude: 51.474022,
    longitude: -0.386293,
    geocodeSource: "Gazetteer of British Place Names",
    geocodeConfidence: "approximate",
  },

  "white-cross-street": {
    latitude: 51.522796,
    longitude: -0.092959,
    geocodeSource:
      "Map of Early Modern London / Streetlist",
    geocodeConfidence: "approximate",
  },

    "crutchet fryers": {
    latitude: 51.511465,
    longitude: -0.077552,
    geocodeSource:
      "Map of Early Modern London / modern Crutched Friars",
    geocodeConfidence: "approximate",
  },

    "hide-park": {
    latitude: 51.5076,
    longitude: -0.1657,
    geocodeSource:
      "The Royal Parks / Hyde Park representative location",
    geocodeConfidence: "approximate",
  },

   "high-gate": {
    latitude: 51.565653,
    longitude: -0.159044,
    geocodeSource:
      "GeoNames / Highgate representative location",
    geocodeConfidence: "approximate",
  },

    "lambs-conduit": {
    latitude: 51.521733,
    longitude: -0.118377,
    geocodeSource:
      "Historic England / Lamb's Conduit Street representative location",
    geocodeConfidence: "approximate",
  },

    edmonton: {
    latitude: 51.6256101,
    longitude: -0.0579786,
    geocodeSource:
      "GeoNames / Edmonton representative location",
    geocodeConfidence: "approximate",
  },
};

export function geocodeHistoricalLocation({
  crimeLocation,
  locationPrecision,
}) {
  if (!crimeLocation) {
    return null;
  }

  const normalizedLocation =
    normalizeLocationName(crimeLocation);

  const match =
    HISTORICAL_LOCATION_COORDINATES[
      normalizedLocation
    ];

  if (!match) {
    return null;
  }

  return {
    crimeLocation,
    locationPrecision:
      locationPrecision ?? null,
    latitude: match.latitude,
    longitude: match.longitude,
    geocodeSource: match.geocodeSource,
    geocodeConfidence:
      match.geocodeConfidence,
  };
}