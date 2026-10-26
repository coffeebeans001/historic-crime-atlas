export async function enrichOldBaileyRecord(
  record,
  fetchOldBaileyRecordById,
  parseOldBaileyXml
) {
  const idkey = record?._source?.idkey ?? null;

  if (!idkey) {
    return {
      searchRecord: record,
      detailedRecord: null,
      parsedXmlData: null
    };
  }

  const result = await fetchOldBaileyRecordById(idkey);

  const detailedRecord =
    result.records?.[0] ?? null;
    
  if (
    detailedRecord &&
    detailedRecord._source?.idkey !== idkey
  ) {
    throw new Error(
      `Detailed record ID mismatch: requested ${idkey}, received ${detailedRecord._source?.idkey ?? "missing"}`
    );
  }

  const xml =
    detailedRecord?._source?.xml ?? "";

  const parsedXmlData =
    parseOldBaileyXml(xml);


 return {
  originalRecord: record,
  detailedRecord,
  parsedXmlData
};
}