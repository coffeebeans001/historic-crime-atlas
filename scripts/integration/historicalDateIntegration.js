import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { importTrialWithTransaction } from "../../src/import/trialImporter.js";

dotenv.config();

const TEST_DATABASE = "historic_crime_atlas_restore_test";
const TEST_TRIAL = {
  rowNumber: 1,

  record: {
    source_case_id: "TEST-JULIAN-1700-INTEGRATION",
    trial_date: "1700-02-29",
    defendant_name: "Historical Date Test",
    offence: "Test offence",
    verdict: "Test verdict",
    source_url: "https://example.org/integration-test",
  },

  defendant: null,
  judge: null,
  offence: null,
  missingReferences: [],
};

const TEST_IMPORT_OPTIONS = {
  importId: null,
  allowMissingDefendant: true,
  allowMissingJudge: true,
  allowMissingOffence: true,
};

function createTestPool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 3306),
    database: TEST_DATABASE,
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0,
  });
}

function createVerifiedTestPool(testPool) {
  return {
    async getConnection() {
      const connection = await testPool.getConnection();

      try {
        const [[result]] = await connection.execute(
          "SELECT DATABASE() AS database_name"
        );

        if (result.database_name !== TEST_DATABASE) {
          throw new Error(
            `Unsafe importer database: ${result.database_name}`
          );
        }

        return connection;
      } catch (error) {
        connection.release();
        throw error;
      }
    },
  };
}

async function cleanupTestTrial(verifiedPool) {
  const connection = await verifiedPool.getConnection();

  try {
    const [result] = await connection.execute(
      `
        DELETE FROM trials
        WHERE source_case_id = ?
      `,
      [TEST_TRIAL.record.source_case_id]
    );

    console.log(
      "Integration test cleanup: removed",
      result.affectedRows,
      "record(s)"
    );
  } finally {
    connection.release();
  }
}

async function runHistoricalDateImport(verifiedPool) {
  return importTrialWithTransaction(TEST_TRIAL, {
    ...TEST_IMPORT_OPTIONS,
    connectionPool: verifiedPool,
  });
}

async function verifyHistoricalDateImport(verifiedPool) {
  const connection = await verifiedPool.getConnection();

  try {
    const [rows] = await connection.execute(
      `
        SELECT
          trial_date,
          historical_trial_date,
          historical_calendar
        FROM trials
        WHERE source_case_id = ?
      `,
      [TEST_TRIAL.record.source_case_id]
    );

    if (rows.length !== 1) {
      throw new Error(
        `Expected one integration test record, found ${rows.length}`
      );
    }

    const trial = rows[0];

    if (
      trial.trial_date !== null ||
      trial.historical_trial_date !== "1700-02-29" ||
      trial.historical_calendar !== null
    ) {
      throw new Error(
        "Historical date integration verification failed."
      );
    }

    console.log("Historical date verification: PASSED");
  } finally {
    connection.release();
  }
}

async function executeHistoricalDateIntegration(verifiedPool) {
  try {
    const result = await runHistoricalDateImport(verifiedPool);

    if (result.status !== "INSERTED") {
      throw new Error(
        `Expected INSERTED status, received: ${result.status}`
      );
    }

    console.log("Historical date importer: INSERTED");

    await verifyHistoricalDateImport(verifiedPool);
  } finally {
    await cleanupTestTrial(verifiedPool);
  }
}

async function main() {
  const testPool = createTestPool();
  const verifiedPool = createVerifiedTestPool(testPool);
  let connection = null;

  try {
    connection = await verifiedPool.getConnection();

    const [[result]] = await connection.execute(
      "SELECT DATABASE() AS database_name"
    );

    if (result.database_name !== TEST_DATABASE) {
      throw new Error(
        `Unsafe database connection: ${result.database_name}`
      );
    }

    console.log("====================================");
    console.log("HISTORICAL DATE INTEGRATION TEST");
    console.log("====================================");
    console.log("Connected database:", result.database_name);
    console.log("Database safety check: PASSED");

    const [[existingTest]] = await connection.execute(
      `
        SELECT COUNT(*) AS record_count
        FROM trials
        WHERE source_case_id = ?
      `,
      [TEST_TRIAL.record.source_case_id]
    );

    if (existingTest.record_count !== 0) {
      throw new Error(
        "Integration test record already exists. Aborting."
      );
    }

    console.log("Test record pre-check: PASSED");

    connection.release();
    connection = null;

    console.log("Initial database connection: RELEASED");

    await executeHistoricalDateIntegration(verifiedPool);

    console.log("Historical date integration test: COMPLETE");
  } finally {
    if (connection) {
      connection.release();
    }

    await testPool.end();
  }
}

main().catch((error) => {
  console.error("Integration test failed:", error.message);
  process.exitCode = 1;
});