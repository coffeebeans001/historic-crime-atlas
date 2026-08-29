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

  "st. giles's": {
    latitude: 51.515532,
    longitude: -0.128385,
    geocodeSource: "Gazetteer of British Place Names - St Giles, Middlesex",
    geocodeConfidence: "approximate",
  },

  "st. pauls shadwell": {
    latitude: 51.509590,
    longitude: -0.052265,
    geocodeSource: "Gazetteer of British Place Names - Shadwell, Middlesex",
    geocodeConfidence: "approximate",
  },

  "st. clement danes": {
    latitude: 51.511028,
    longitude: -0.119885,
    geocodeSource: "Gazetteer of British Place Names - St Clement Danes / Strand",
    geocodeConfidence: "approximate",
  },

  holborn: {
    aliases: ["holbourn"],
    latitude: 51.518247,
    longitude: -0.111248,
    geocodeSource: "Gazetteer of British Place Names - Holborn, Middlesex",
    geocodeConfidence: "approximate",
  },

  strand: {
    latitude: 51.511028,
    longitude: -0.119885,
    geocodeSource: "Gazetteer of British Place Names - The Strand, Middlesex",
    geocodeConfidence: "approximate",
  },

    "st. sepulchres parish": {
    latitude: 51.5167,
    longitude: -0.1022,
    geocodeSource: "Historic England - St Sepulchre without Newgate",
    geocodeConfidence: "approximate",
  },

  "bartholomew-close": {
    latitude: 51.51857,
    longitude: -0.09814,
    geocodeSource: "Bartholomew Close historical location reference",
    geocodeConfidence: "approximate",
  },

  "temple-bar": {
    latitude: 51.51438,
    longitude: -0.11192,
    geocodeSource: "Historic Temple Bar site - Fleet Street / Strand boundary",
    geocodeConfidence: "approximate",
  },

  "st. martins in the fields": {
    latitude: 51.508823,
    longitude: -0.126697,
    geocodeSource: "Gazetteer of British Place Names - St Martin-in-the-Fields",
    geocodeConfidence: "approximate",
  },

  temple: {
    latitude: 51.511944,
    longitude: -0.111111,
    geocodeSource: "Temple, London historical locality",
    geocodeConfidence: "approximate",
  },

  "royal exchange": {
    latitude: 51.513623,
    longitude: -0.087226,
    geocodeSource: "City of London / Royal Exchange",
    geocodeConfidence: "approximate",
  },

  "st. michael cornhil": {
    latitude: 51.5133,
    longitude: -0.0857,
    geocodeSource: "Historic England - Church of St Michael, Cornhill",
    geocodeConfidence: "approximate",
  },

    "st. georges fields": {
    latitude: 51.4975,
    longitude: -0.1015,
    geocodeSource: "Historical St George's Fields, Southwark",
    geocodeConfidence: "approximate",
  },

    "wood-green in the parish of tatenham": {
    latitude: 51.597365,
    longitude: -0.116848,
    geocodeSource: "London Borough of Haringey - Wood Green Common / historical Tottenham parish",
    geocodeConfidence: "approximate",
  },

    rochester: {
    latitude: 51.388559,
    longitude: 0.505236,
    geocodeSource: "Gazetteer of British Place Names - Rochester, Kent",
    geocodeConfidence: "approximate",
  },

      bagshot: {
    latitude: 51.358986,
    longitude: -0.692555,
    geocodeSource: "Gazetteer of British Place Names - Bagshot, Surrey",
    geocodeConfidence: "approximate",
  },

      chelsea: {
    aliases: ["chelsy"],
    latitude: 51.487777,
    longitude: -0.167877,
    geocodeSource: "Gazetteer of British Place Names - Chelsea, Middlesex",
    geocodeConfidence: "approximate",
  },

   marylebone: {
    aliases: ["maribone"],
    latitude: 51.522946,
    longitude: -0.152573,
    geocodeSource: "Gazetteer of British Place Names - Marylebone, Middlesex",
    geocodeConfidence: "approximate",
  },

  "lombard street": {
    aliases: ["lumbard street"],
    latitude: 51.5127,
    longitude: -0.0873,
    geocodeSource: "Historical Lombard Street, City of London",
    geocodeConfidence: "approximate",
  },

  "bunhill fields": {
    aliases: ["bunhil fields"],
    latitude: 51.5236,
    longitude: -0.0878,
    geocodeSource: "Historic England - Bunhill Fields Burial Ground",
    geocodeConfidence: "approximate",
  },

    "hyde park corner": {
    aliases: ["hide-park-corner"],
    latitude: 51.503003,
    longitude: -0.152258,
    geocodeSource: "Gazetteer of British Place Names - Hyde Park Corner, Middlesex",
    geocodeConfidence: "approximate",
  },

    "great queen street": {
    aliases: ["great queen-street"],
    latitude: 51.5153,
    longitude: -0.1205,
    geocodeSource: "Historic England / historical Great Queen Street",
    geocodeConfidence: "approximate",
  },

    "duke's place": {
    aliases: ["dukes-place"],
    latitude: 51.51361,
    longitude: -0.07778,
    geocodeSource: "Historical St James Duke's Place / Aldgate",
    geocodeConfidence: "approximate",
  },

    "bagshot heath": {
    latitude: 51.348611,
    longitude: -0.706667,
    geocodeSource: "British Place Names - Bagshot Heath, Surrey",
    geocodeConfidence: "approximate",
  },

    "clements inne": {
    latitude: 51.513742,
    longitude: -0.114669,
    geocodeSource: "Map of Early Modern London / historical Clement's Inn",
    geocodeConfidence: "approximate",
  },

    "the lord of holland's walk": {
    latitude: 51.502419,
    longitude: -0.200707,
    geocodeSource: "Historical Lord Holland's Lane / Holland Walk, Kensington",
    geocodeConfidence: "approximate",
  },

    "york buildings": {
    aliases: ["york buildings, in the strand"],
    latitude: 51.5086,
    longitude: -0.12451,
    geocodeSource: "Layers of London - York House redevelopment / York Buildings",
    geocodeConfidence: "approximate",
  },

    "new inn": {
    aliases: [
      "new-inn, in the parish of st.clements-dean's",
    ],
    latitude: 51.5138,
    longitude: -0.1155,
    geocodeSource:
      "London Lives / historical New Inn, St Clement Danes",
    geocodeConfidence: "approximate",
  },

    "christ church parish, newgate street": {
    aliases: [
      "christ church in the ward of farrington within",
    ],
    latitude: 51.5159,
    longitude: -0.1019,
    geocodeSource:
      "Historical Christ Church Newgate Street parish / Farringdon Within",
    geocodeConfidence: "approximate",
  },

    "bull inn, bishopsgate street": {
    aliases: [
      "bull inn in bishopsgate-street",
    ],
    latitude: 51.5155,
    longitude: -0.0816,
    geocodeSource:
      "Historical Bull Inn, Bishopsgate Street, City of London",
    geocodeConfidence: "approximate",
  },

    "green dragon tavern, fleet street": {
    aliases: [
      "green-dragon-tavern",
    ],
    latitude: 51.5138,
    longitude: -0.1089,
    geocodeSource:
      "Grub Street Project / historical Green Dragon Tavern, Fleet Street",
    geocodeConfidence: "approximate",
  },

    "old brentford": {
    aliases: ["old brantford"],
    latitude: 51.487,
    longitude: -0.295,
    geocodeSource:
      "A Vision of Britain / historical Old Brentford, Middlesex",
    geocodeConfidence: "approximate",
  },

    ealing: {
    aliases: ["etlin, near brandford"],
    latitude: 51.513097,
    longitude: -0.304897,
    geocodeSource:
      "Gazetteer of British Place Names / Ealing historical parish",
    geocodeConfidence: "approximate",
  },

    "southall green": {
    aliases: ["southtown"],
    latitude: 51.503374,
    longitude: -0.380386,
    geocodeSource:
      "Ealing historical records / Gazetteer of British Place Names - Old Southall",
    geocodeConfidence: "approximate",
  },

    "old london bridge": {
    aliases: ["the bridge"],
    latitude: 51.50673,
    longitude: -0.08721,
    geocodeSource:
      "Historical Old London Bridge / St Olave Southwark context",
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