import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const TEST_DATABASE = "historic_crime_atlas_restore_test";

const TEST_SOURCE_ID = "TEST-JULIAN-1700-MAPPED";

async function verifyTestDatabase(connection) {
  const [[result]] = await connection.query(
    "SELECT DATABASE() AS database_name"
  );

  if (result.database_name !== TEST_DATABASE) {
    throw new Error(
      `Unsafe database connection: ${result.database_name}`
    );
  }

  console.log(
    "Database safety check: PASSED",
    result.database_name
  );
}

async function verifyMappedTestTrial(pool) {
  await verifyTestDatabase(pool);

  const [rows] = await pool.execute(
    `
      SELECT
        source_case_id,
        trial_date,
        historical_trial_date,
        historical_calendar,
        latitude,
        longitude
      FROM trials
      WHERE source_case_id = ?
    `,
    [TEST_SOURCE_ID]
  );

  if (rows.length !== 1) {
    throw new Error(
      `Expected one mapped test trial, found ${rows.length}`
    );
  }

  const trial = rows[0];

  if (
    trial.trial_date !== null ||
    trial.historical_trial_date !== "1700-02-29" ||
    trial.historical_calendar !== "julian" ||
    Number(trial.latitude) !== 51.5074 ||
    Number(trial.longitude) !== -0.1278
  ) {
    throw new Error(
      "Mapped historical-date verification failed."
    );
  }

  console.log("Mapped historical-date verification: PASSED");
}

async function insertMappedTestTrial(pool) {
  const connection = await pool.getConnection();

  try {
    await verifyTestDatabase(connection);

    const [[existing]] = await connection.execute(
      `
        SELECT COUNT(*) AS record_count
        FROM trials
        WHERE source_case_id = ?
      `,
      [TEST_SOURCE_ID]
    );

    if (existing.record_count !== 0) {
      throw new Error(
        "Mapped test record already exists. Aborting insertion."
      );
    }

    const [result] = await connection.execute(
      `
        INSERT INTO trials (
          source_case_id,
          trial_date,
          historical_trial_date,
          historical_calendar,
          defendant_name,
          offence,
          verdict,
          latitude,
          longitude
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        TEST_SOURCE_ID,
        null,
        "1700-02-29",
        "julian",
        "Historical Mapped Test",
        "Test offence",
        "Test verdict",
        51.5074,
        -0.1278,
      ]
    );

    if (result.affectedRows !== 1) {
      throw new Error(
        "Mapped test insertion did not create exactly one record."
      );
    }

    console.log("Mapped test trial: INSERTED");
  } finally {
    connection.release();
  }
}

async function cleanupMappedTestTrial(pool) {
  await verifyTestDatabase(pool);

  const [result] = await pool.execute(
    `
      DELETE FROM trials
      WHERE source_case_id = ?
    `,
    [TEST_SOURCE_ID]
  );

  console.log(
    "Mapped test cleanup: removed",
    result.affectedRows,
    "record(s)"
  );
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 3306),
    database: TEST_DATABASE,
    connectionLimit: 1,
  });

  try {
    await verifyTestDatabase(pool);

    console.log("====================================");
    console.log("HISTORICAL DATE MAPPED TEST");
    console.log("====================================");
    console.log("Isolated database connection verified.");
    const mode = process.argv[2];

    if (mode !== "insert" && mode !== "cleanup") {
      throw new Error(
        "Specify a test mode: insert or cleanup."
      );
    }

    console.log("Mapped test mode:", mode);

    if (mode === "insert") {
  let insertedByThisRun = false;

  try {
    await insertMappedTestTrial(pool);
    insertedByThisRun = true;

    await verifyMappedTestTrial(pool);

    console.log(
      "Mapped test record ready for geographic API testing."
    );
  } catch (error) {
    if (insertedByThisRun) {
      try {
        await cleanupMappedTestTrial(pool);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Mapped test failed and automatic cleanup also failed."
        );
      }
    }

    throw error;
  }
}

    if (mode === "cleanup") {
      await cleanupMappedTestTrial(pool);
     }
    } finally {
        await pool.end();
    }
    }

main().catch((error) => {
  console.error("Mapped test failed:", error.message);
  process.exitCode = 1;
});

