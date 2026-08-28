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

    hornsey: {
    aliases: ["hornzey"],
    latitude: 51.587222,
    longitude: -0.121944,
    geocodeSource: "A Vision of Britain / historical gazetteer",
    geocodeConfidence: "approximate",
  },

    islington: {
    latitude: 51.536351,
    longitude: -0.103227,
    geocodeSource: "Gazetteer of British Place Names",
    geocodeConfidence: "approximate",
  },

  finchley: {
    latitude: 51.598889,
    longitude: -0.186944,
    geocodeSource: "Wikishire historical place reference",
    geocodeConfidence: "approximate",
  },

  chiswick: {
    latitude: 51.487222,
    longitude: -0.247222,
    geocodeSource: "Wikishire - Old Chiswick",
    geocodeConfidence: "approximate",
  },

  deptford: {
    latitude: 51.478056,
    longitude: -0.026389,
    geocodeSource: "Wikishire historical place reference",
    geocodeConfidence: "approximate",
  },

  "mile-end": {
    latitude: 51.524722,
    longitude: -0.031389,
    geocodeSource: "Wikishire historical place reference",
    geocodeConfidence: "approximate",
  },

    uxbridge: {
    latitude: 51.546783,
    longitude: -0.480339,
    geocodeSource: "Gazetteer of British Place Names",
    geocodeConfidence: "approximate",
  },

  blackheath: {
    latitude: 51.466993,
    longitude: -0.007757,
    geocodeSource: "Gazetteer of British Place Names - Blackheath, Kent",
    geocodeConfidence: "approximate",
  },

  bow: {
    latitude: 51.528697,
    longitude: -0.016815,
    geocodeSource: "Gazetteer of British Place Names - Bow, Middlesex",
    geocodeConfidence: "approximate",
  },

  "turnham-green": {
    latitude: 51.491671,
    longitude: -0.266409,
    geocodeSource: "Gazetteer of British Place Names - Turnham Green, Middlesex",
    geocodeConfidence: "approximate",
  },

  "harrow on the hill": {
    latitude: 51.573554,
    longitude: -0.337102,
    geocodeSource: "St Mary's Church, Harrow on the Hill / historic Middlesex",
    geocodeConfidence: "approximate",
  },

  "hatton-garden": {
    latitude: 51.520000,
    longitude: -0.108333,
    geocodeSource: "Hatton Garden historical location reference",
    geocodeConfidence: "approximate",
    },

    clerkenwell: {
    aliases: ["clarkenwell"],
    latitude: 51.5236,
    longitude: -0.1051,
    geocodeSource: "Map of Early Modern London / Clerkenwell",
    geocodeConfidence: "approximate",
  },

  whitechapel: {
    aliases: ["white-chapple", "white chappel"],
    latitude: 51.5194,
    longitude: -0.0612,
    geocodeSource: "Map of Early Modern London / Whitechapel",
    geocodeConfidence: "approximate",
  },

  cornhill: {
    aliases: ["cornhil"],
    latitude: 51.5135,
    longitude: -0.0865,
    geocodeSource: "Map of Early Modern London / Cornhill",
    geocodeConfidence: "approximate",
  },

  "drury-lane": {
    aliases: ["druery-lane"],
    latitude: 51.5142,
    longitude: -0.1225,
    geocodeSource: "Map of Early Modern London / Drury Lane",
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

  let match =
    HISTORICAL_LOCATION_COORDINATES[
      normalizedLocation
    ];

  if (!match) {
    match = Object.values(
      HISTORICAL_LOCATION_COORDINATES
    ).find((entry) =>
      entry.aliases?.includes(
        normalizedLocation
      )
    );
  }

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