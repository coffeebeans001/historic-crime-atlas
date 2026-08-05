const sourceCaseId = process.argv[2] || "t16740429-1";

const BASE_URL =
  "https://www.dhi.ac.uk/api/data/oldbailey_record";

async function testRecordLookup(parameterName) {
  const url =
    `${BASE_URL}?${parameterName}=${encodeURIComponent(sourceCaseId)}`;

  console.log(`\nTesting parameter: ${parameterName}`);
  console.log(`Request: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    console.log(
      `Request failed: ${response.status} ${response.statusText}`
    );

    return;
  }

  const data = await response.json();
  const records = data?.hits?.hits ?? [];

  console.log(`Records returned: ${records.length}`);

  if (records.length === 0) {
    console.log("No matching records returned.");
    return;
  }

  const exactMatch = records.find(
    (record) => record?._source?.idkey === sourceCaseId
  );

  if (!exactMatch) {
    console.log(
      "Records were returned, but none matched the requested idkey exactly."
    );

    console.log(
      "First returned idkey:",
      records[0]?._source?.idkey ?? "Missing"
    );

    return;
  }

  const source = exactMatch._source ?? {};
  const transcript = source.text ?? "";

  console.log("\nExact record found:");
  console.log("----------------------------------------");
  console.log(`Source ID: ${source.idkey ?? "Missing"}`);
  console.log(`Title: ${source.title ?? "Missing"}`);
  console.log(`Transcript length: ${transcript.length}`);
  console.log(`Image count: ${source.images?.length ?? 0}`);

  console.log("\nComplete returned _source object:\n");
  console.log(JSON.stringify(source, null, 2));
}

async function probeRecordEndpoints() {
  try {
    console.log(
      `Searching for individual Old Bailey record: ${sourceCaseId}`
    );

    const possibleParameters = [
      "idkey",
      "id",
      "_id",
    ];

    for (const parameterName of possibleParameters) {
      await testRecordLookup(parameterName);
    }
  } catch (error) {
    console.error("\nUnable to complete the API probe.");
    console.error(error.message);
    process.exitCode = 1;
  }
}

probeRecordEndpoints();