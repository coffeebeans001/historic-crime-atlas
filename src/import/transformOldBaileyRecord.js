function convertOldBaileyDate(dateText) {
  if (!dateText) {
    return null;
  }

  const cleanedDate = dateText
    .replace(/\.$/, "")
    .replace(
      /(\d+)(st|nd|rd|th)/i,
      "$1"
    )
    .trim();

  const parsedDate = new Date(cleanedDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const year = parsedDate.getUTCFullYear();
  const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function extractTitleParts(title) {
  if (!title || typeof title !== "string") {
    return {
      defendantName: null,
      offenceDescription: null,
      trialDate: null,
    };
  }

  const titleParts = title
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (titleParts.length >= 3) {
    return {
      defendantName: titleParts[0] || null,
      offenceDescription: titleParts.slice(1, -1).join(". ") || null,
      trialDate: convertOldBaileyDate(titleParts.at(-1)),
    };
  }

  if (titleParts.length === 2) {
    return {
      defendantName: null,
      offenceDescription: titleParts[0] || null,
      trialDate: convertOldBaileyDate(titleParts[1]),
    };
  }

  return {
    defendantName: null,
    offenceDescription: titleParts[0] || null,
    trialDate: null,
  };
}

function detectVerdict(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const normalisedText = text.toLowerCase();

  const acquittalPhrases = [
    "jury acquitted",
    "was acquitted",
    "were acquitted",
    "found him not guilty",
    "found her not guilty",
    "found them not guilty",
    "verdict not guilty",
  ];

  const guiltyPhrases = [
    "jury found him guilty",
    "jury found her guilty",
    "jury found them guilty",
    "was found guilty",
    "were found guilty",
    "verdict guilty",
  ];

  if (
    acquittalPhrases.some((phrase) =>
      normalisedText.includes(phrase)
    )
  ) {
    return "Not Guilty";
  }

  if (
    guiltyPhrases.some((phrase) =>
      normalisedText.includes(phrase)
    )
  ) {
    return "Guilty";
  }

  return null;
}

export function transformOldBaileyRecord(record, parsedXmlData) {
  const source = record?._source;

  if (!source) {
    throw new Error(
      "The Old Bailey API record does not contain a _source object."
    );
  }

  const {
    defendantName,
    offenceDescription,
    trialDate,
  } = extractTitleParts(source.title);

  return {
  source_case_id: source.idkey || null,

  defendant_name:
    parsedXmlData?.defendantName ??
    defendantName,

  offence:
    parsedXmlData?.offenceText ??
    offenceDescription,

  offence_category:
    parsedXmlData?.offenceCategory ?? null,

  offence_subcategory:
    parsedXmlData?.offenceSubcategory ?? null,

  verdict:
    parsedXmlData?.verdictCategory === "guilty"
      ? "Guilty"
      : parsedXmlData?.verdictCategory === "notGuilty"
        ? "Not Guilty"
        : detectVerdict(source.text),

  trial_date: trialDate,
  source_url: source.images?.[0] || null,
  transcript_text: source.text || null,
  case_summary: null,
  source_title: source.title || null,
  source_type: "Old Bailey API",
};
}