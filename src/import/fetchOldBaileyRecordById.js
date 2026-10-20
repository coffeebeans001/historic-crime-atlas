import { fetchOldBaileyJson } from "./fetchOldBaileyJson.js";

const SINGLE_RECORD_ENDPOINT =
  "https://www.dhi.ac.uk/api/data/oldbailey_record_single";

export async function fetchOldBaileyRecordById(idkey) {
  if (typeof idkey !== "string" || idkey.trim() === "") {
    throw new Error("A valid Old Bailey idkey is required.");
  }

  const recordId = idkey.trim();

  const apiUrl =
    `${SINGLE_RECORD_ENDPOINT}` +
    `?idkey=${encodeURIComponent(recordId)}`;

  const data = await fetchOldBaileyJson(apiUrl);
  const hits = data?.hits?.hits ?? [];

  return {
    requestedId: recordId,
    totalResults: data?.hits?.total ?? 0,
    records: hits,
  };
}