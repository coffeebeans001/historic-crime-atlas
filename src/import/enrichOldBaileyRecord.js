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