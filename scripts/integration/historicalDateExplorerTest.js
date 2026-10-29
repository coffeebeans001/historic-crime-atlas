import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const TEST_DATABASE = "historic_crime_atlas_restore_test";

const TEST_SOURCE_ID = "TEST-JULIAN-1700-EXPLORER";

async function cleanupTestTrial(pool) {
  const [[database]] = await pool.query(
    "SELECT DATABASE() AS database_name"
  );

  if (database.database_name !== TEST_DATABASE) {
    throw new Error(
      `Unsafe cleanup database: ${database.database_name}`
    );
  }

  const [result] = await pool.execute(
    `
      DELETE FROM trials
      WHERE source_case_id = ?
    `,
    [TEST_SOURCE_ID]
  );

  console.log(
    "Explorer test cleanup: removed",
    result.affectedRows,
    "record(s)"
  );
}

async function verifyTestTrial(pool) {
  const [[database]] = await pool.query(
    "SELECT DATABASE() AS database_name"
  );

  if (database.database_name !== TEST_DATABASE) {
    throw new Error(
      `Unsafe verification database: ${database.database_name}`
    );
  }

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
      `Expected one Explorer test trial, found ${rows.length}`
    );
  }

  const trial = rows[0];

  if (
    trial.trial_date !== null ||
    trial.historical_trial_date !== "1700-02-29" ||
    trial.latitude !== null ||
    trial.longitude !== null
  ) {
    throw new Error(
      "Explorer historical-date verification failed."
    );
  }

  console.log("Explorer historical-date verification: PASSED");
}

async function insertTestTrial(pool) {
  const connection = await pool.getConnection();

  try {
    const [[database]] = await connection.query(
      "SELECT DATABASE() AS database_name"
    );

    if (database.database_name !== TEST_DATABASE) {
      throw new Error(
        `Unsafe insertion database: ${database.database_name}`
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
        "Historical Explorer Test",
        "Test offence",
        "Test verdict",
        null,
        null,
      ]
    );

    if (result.affectedRows !== 1) {
      throw new Error(
        "Explorer test insertion did not create exactly one record."
      );
    }

    console.log("Explorer test trial: INSERTED");
  } finally {
    connection.release();
  }
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
    const [[result]] = await pool.query(
      "SELECT DATABASE() AS database_name"
    );

    if (result.database_name !== TEST_DATABASE) {
      throw new Error(
        `Unsafe database connection: ${result.database_name}`
      );
    }

    console.log("====================================");
    console.log("HISTORICAL DATE EXPLORER TEST");
    console.log("====================================");
    console.log("Connected database:", result.database_name);
    console.log("Database safety check: PASSED");

    const mode = process.argv[2];

    if (mode !== "insert" && mode !== "cleanup") {
      throw new Error(
        "Specify a test mode: insert or cleanup."
      );
    }

    console.log("Explorer test mode:", mode);

    if (mode === "insert") {
      const [[existingTest]] = await pool.execute(
        `
          SELECT COUNT(*) AS record_count
          FROM trials
          WHERE source_case_id = ?
        `,
        [TEST_SOURCE_ID]
      );

      if (existingTest.record_count !== 0) {
        throw new Error(
          "Explorer test record already exists. Aborting insertion."
        );
      }

      console.log("Test record pre-check: PASSED");
    }

      if (mode === "insert") {
        try {
          await insertTestTrial(pool);
          await verifyTestTrial(pool);

          console.log(
            "Explorer test record ready for API and browser testing."
          );
        } catch (error) {
          try {
            await cleanupTestTrial(pool);
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "Explorer test failed and automatic cleanup also failed."
            );
          }

          throw error;
        }
      }

      if (mode === "cleanup") {
        await cleanupTestTrial(pool);
      }

    } finally {
        await pool.end();
    }
   }

main().catch((error) => {
  console.error("Explorer test failed:", error.message);
  process.exitCode = 1;
});