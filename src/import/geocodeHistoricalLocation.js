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
    latitude: null,
    longitude: null,
    geocodeSource: "manual",
    geocodeConfidence: "unverified",
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