function classifyLocationPrecision(location) {
  if (!location) {
    return null;
  }

  const normalized = location
    .toLowerCase()
    .trim();

  if (
    normalized.includes("parish")
  ) {
    return "parish";
  }

  if (
    normalized.includes("church")
  ) {
    return "church";
  }

  if (
    normalized.includes("street") ||
    normalized.includes("road") ||
    normalized.includes("lane")
  ) {
    return "street";
  }

  return "named_place";
}

export function parseOldBaileyXml(xml = "") {
  const defendantMatches =
    xml.match(
      /<persName[^>]*id="[^"]*defend[^"]*"[^>]*>[\s\S]*?<\/persName>/g
    ) ?? [];

  const verdictMatches =
    xml.match(
      /<rs[^>]*id="[^"]*verdict[^"]*"[^>]*>[\s\S]*?<\/rs>/g
    ) ?? [];

  const punishmentMatches =
    xml.match(
      /<rs[^>]*id="[^"]*(?:punish|sentence)[^"]*"[^>]*>[\s\S]*?<\/rs>/g
    ) ?? [];

 const offenceMatches =
  xml.match(
    /<rs[^>]*type="offenceDescription"[^>]*>[\s\S]*?<\/rs>/g
  ) ?? [];

 const locationMatches =
  xml.match(
    /<placeName\b[^>]*>[\s\S]*?<\/placeName>/gi
  ) ?? []; 

 const crimeLocationMatch = xml.match(
  /<interp\b[^>]*type="crimeLocation"[^>]*value="([^"]+)"/i
);

const locationName =
  crimeLocationMatch?.[1]?.trim() ?? null; 

const locationTextMatch = xml.match(
  /<placeName\b[^>]*>\s*([^<]+?)\s*</i
);

const locationText =
  locationTextMatch?.[1]?.trim() ?? null;

const crimeLocation =
  locationName ?? locationText ?? null; 

const locationPrecision =
  classifyLocationPrecision(crimeLocation);  

  const defendants = defendantMatches.map((defendantNode) => {
  const idMatch = defendantNode.match(
    /<persName[^>]*id="([^"]+)"/
  );

  const genderMatch = defendantNode.match(
    /<interp[^>]*type="gender"[^>]*value="([^"]+)"/
  );

  const ageMatch = defendantNode.match(
  /<interp[^>]*type="defendantNameAgeInt"[^>]*value="([^"]+)"/
);

  const labelTypeMatch = defendantNode.match(
    /<rs[^>]*type="([^"]+)"[^>]*>/
  );

  const labelValueMatch = defendantNode.match(
    /<interp[^>]*type="defendantNameLabel"[^>]*value="([^"]+)"/
  );

  const label = defendantNode
    .replace(/<interp[\s\S]*?\/>/g, "")
    .replace(/<join[\s\S]*?\/>/g, "")
    .replace(/<xptr[\s\S]*?\/>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    id: idMatch?.[1] ?? null,
    label: label || labelValueMatch?.[1] || null,
    gender: genderMatch?.[1] ?? null,
    age: ageMatch?.[1]
      ? Number.parseInt(ageMatch[1], 10)
      : null,
    labelType: labelTypeMatch?.[1] ?? null,
    labelValue: labelValueMatch?.[1] ?? null,
  };
});

const defendantNode = defendantMatches[0] ?? null;

const defendantName =
  defendants[0]?.label ?? null;

const defendantGender =
  defendants[0]?.gender ?? null;

const verdictNode = verdictMatches[0] ?? null;

let verdictCategory = null;
let verdictSubcategory = null;
let plea = null;
let verdictText = null;

if (verdictNode) {
  const verdictCategoryMatch = verdictNode.match(
    /<interp[^>]*type="verdictCategory"[^>]*value="([^"]+)"/
  );

  const verdictSubcategoryMatch = verdictNode.match(
    /<interp[^>]*type="verdictSubcategory"[^>]*value="([^"]+)"/
  );

  const pleaMatch = verdictNode.match(
    /<interp[^>]*type="plea"[^>]*value="([^"]+)"/
  );

  verdictCategory = verdictCategoryMatch?.[1] ?? null;
  verdictSubcategory = verdictSubcategoryMatch?.[1] ?? null;
  plea = pleaMatch?.[1] ?? null;

  verdictText = verdictNode
    .replace(/<interp[\s\S]*?\/>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const punishmentNode = punishmentMatches[0] ?? null;

let punishment = null;

if (punishmentNode) {
  punishment = punishmentNode
    .replace(/<interp[\s\S]*?\/>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const offenceNode = offenceMatches[0] ?? null;

let offenceCategory = null;
let offenceSubcategory = null;
let offenceText = null;

if (offenceNode) {
  const offenceCategoryMatch = offenceNode.match(
    /<interp[^>]*type="offenceCategory"[^>]*value="([^"]+)"/
  );

  const offenceSubcategoryMatch = offenceNode.match(
    /<interp[^>]*type="offenceSubcategory"[^>]*value="([^"]+)"/
  );

  offenceCategory = offenceCategoryMatch?.[1] ?? null;
  offenceSubcategory = offenceSubcategoryMatch?.[1] ?? null;

  offenceText = offenceNode
    .replace(/<interp[\s\S]*?\/>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

  return {
    defendantMatches,
    verdictMatches,
    punishmentMatches,
    offenceMatches,
    locationMatches,

    defendantName,
    defendantGender,
    defendants,
    verdictCategory,
    verdictSubcategory,
    plea,
    verdictText,
    punishment,
    offenceCategory,
    offenceSubcategory,
    offenceText,

    crimeLocation,
    locationText,
    locationPrecision,
  };
}
  