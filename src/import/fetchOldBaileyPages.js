import { fetchOldBaileyJson } from "./fetchOldBaileyJson.js";

const OLD_BAILEY_SEARCH_ENDPOINT =
  "https://www.dhi.ac.uk/api/data/oldbailey_record";

export async function fetchOldBaileyPages({
  query = null,
  startOffset = 0,
  recordCount,
  pageSize = 10,
  fetchPage = fetchOldBaileyJson,
  onPage = null,
}) {
  const records = [];
  let totalResults = 0;

  for (
    let from = startOffset;
    from < startOffset + recordCount;
    from += pageSize
  ) {
    const pageUrl =
      query === null
        ? `${OLD_BAILEY_SEARCH_ENDPOINT}?from=${from}`
        : `${OLD_BAILEY_SEARCH_ENDPOINT}?text=${encodeURIComponent(query)}&from=${from}`;

    const pageData = await fetchPage(pageUrl);

    if (from === 0) {
      totalResults = pageData.hits?.total ?? 0;
    }

   const pageRecords = pageData.hits?.hits ?? [];

   if (onPage) {
     onPage({
       from,
       query,
       pageData,
       pageRecords,
     }); 
   }

   records.push(...pageRecords);
     
   if (pageRecords.length === 0) {
     break;
   }
  }

  return {
    records: records.slice(0, recordCount),
    totalResults,
  };
}