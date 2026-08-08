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

  const defendantNode = defendantMatches[0] ?? null;

    let defendantName = null;
    let defendantGender = null;

    if (defendantNode) {
    defendantName = defendantNode
        .replace(/<interp[\s\S]*?\/>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();

  const genderMatch = defendantNode.match(
    /<interp[^>]*type="gender"[^>]*value="([^"]+)"/
  );

  defendantGender = genderMatch?.[1] ?? null;
}  

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
  defendantName,
  defendantGender,
  verdictCategory,
  verdictSubcategory,
  plea,
  verdictText,
  punishment,
  offenceCategory,
  offenceSubcategory,
  offenceText
};


}
  