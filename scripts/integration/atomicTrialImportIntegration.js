import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { importTrialWithTransaction } from "../../src/import/trialImporter.js";

dotenv.config();

const TEST_DATABASE = "historic_crime_atlas_restore_test";
const TEST_SOURCE_PREFIX = "TEST-ATOMIC-C3-";

const EXPECTED_BASELINE = {
  trials: 275,
  defendant_nodes: 354,
  offence_nodes: 304,
  verdict_nodes: 290,
  punishment_nodes: 119,
  criminal_charges: 380,
  defendant_punishments: 146,
};

const SUCCESS_SOURCE_ID =
  `${TEST_SOURCE_PREFIX}SUCCESS`;

const SUCCESS_TEST_ITEM = {
  rowNumber: 1,

  record: {
    source_case_id: SUCCESS_SOURCE_ID,
    trial_date: "1700-03-01",
    defendant_name: "Atomic Integration Test",
    offence: "Test theft offence",
    verdict: "Guilty",
    source_url: "https://example.org/atomic-test",
  },

  defendant: null,
  judge: null,
  offence: null,
  missingReferences: [],

  parsedXmlData: {
    defendants: [
      {
        id: "TEST-ATOMIC-C3-DEF-1",
        label: "Atomic Test Defendant",
        gender: "male",
        age: null,
        labelType: "defendantName",
        labelValue: "Atomic Test Defendant",
      },
    ],

    offences: [
      {
        id: "TEST-ATOMIC-C3-OFF-1",
        category: "theft",
        subcategory: "simpleLarceny",
        text: "Test theft offence",
      },
    ],

    verdicts: [],
    punishments: [],
    criminalCharges: [],
    defendantPunishments: [],
  },
};

const ROLLBACK_SOURCE_ID =
  `${TEST_SOURCE_PREFIX}ROLLBACK`;

const ROLLBACK_TEST_ITEM = {
  rowNumber: 2,

  record: {
    source_case_id: ROLLBACK_SOURCE_ID,
    trial_date: "1700-03-02",
    defendant_name: "Atomic Rollback Test",
    offence: "Test theft offence",
    verdict: "Guilty",
    source_url: "https://example.org/atomic-rollback-test",
  },

  defendant: null,
  judge: null,
  offence: null,
  missingReferences: [],

  parsedXmlData: {
    defendants: [
      {
        id: "TEST-ATOMIC-C3-ROLLBACK-DEF-1",
        label: "Rollback Test Defendant",
        gender: "male",
        age: null,
        labelType: "defendantName",
        labelValue: "Rollback Test Defendant",
      },
    ],

    offences: [
      {
        id: null,
        category: "theft",
        subcategory: "simpleLarceny",
        text: "Deliberately invalid offence node",
      },
    ],

    verdicts: [],
    punishments: [],
    criminalCharges: [],
    defendantPunishments: [],
  },
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

async function cleanupTestTrial(verifiedPool, sourceCaseId) {
  if (
    sourceCaseId !== SUCCESS_SOURCE_ID &&
    sourceCaseId !== ROLLBACK_SOURCE_ID
  ) {
    throw new Error(
        "Unsafe cleanup: unrecognised atomic test identifier."
    );
  }

  const connection = await verifiedPool.getConnection();

  try {
    const [result] = await connection.execute(
      `
        DELETE FROM trials
        WHERE source_case_id = ?
      `,
      [sourceCaseId]
    );

    if (result.affectedRows > 1) {
      throw new Error("Unexpected cleanup row count");
    }

    console.log(
      `Test cleanup: ${result.affectedRows} trial(s) removed`
    );
  } finally {
    connection.release();
  }
}

async function runSuccessfulAtomicImport(verifiedPool) {
  const result = await importTrialWithTransaction(
    SUCCESS_TEST_ITEM,
    {
      importId: null,
      allowMissingDefendant: true,
      allowMissingJudge: true,
      allowMissingOffence: true,
      insertXmlRelationships: true,
      connectionPool: verifiedPool,
    }
  );

  console.log("Successful atomic import result:", result);

  if (result.status !== "INSERTED") {
    throw new Error(
      `Expected INSERTED, received ${result.status}: ${
        result.errors?.join("; ") ?? "No error details"
      }`
    );
  }

  return result;
}

async function verifySuccessfulAtomicImport(verifiedPool) {
  const connection = await verifiedPool.getConnection();

  try {
    const [[counts]] = await connection.execute(
      `
        SELECT
          COUNT(DISTINCT t.id) AS trials,
          COUNT(DISTINCT d.id) AS defendant_nodes,
          COUNT(DISTINCT o.id) AS offence_nodes
        FROM trials t
        LEFT JOIN trial_defendant_nodes d
          ON d.trial_id = t.id
        LEFT JOIN trial_offence_nodes o
          ON o.trial_id = t.id
        WHERE t.source_case_id = ?
      `,
      [SUCCESS_SOURCE_ID]
    );

    console.log("Atomic import verification:", counts);

    if (
      counts.trials !== 1 ||
      counts.defendant_nodes !== 1 ||
      counts.offence_nodes !== 1
    ) {
      throw new Error(
        "Atomic import verification failed: unexpected record counts."
      );
    }

    console.log(
      "PASS: Trial and XML relationships committed successfully."
    );
  } finally {
    connection.release();
  }
}

async function verifyAtomicRollback(verifiedPool) {
  const connection = await verifiedPool.getConnection();

  try {
    const [[counts]] = await connection.execute(
      `
        SELECT
          COUNT(DISTINCT t.id) AS trials,
          COUNT(DISTINCT d.id) AS defendant_nodes,
          COUNT(DISTINCT o.id) AS offence_nodes
        FROM trials t
        LEFT JOIN trial_defendant_nodes d
          ON d.trial_id = t.id
        LEFT JOIN trial_offence_nodes o
          ON o.trial_id = t.id
        WHERE t.source_case_id = ?
      `,
      [ROLLBACK_SOURCE_ID]
    );

    const [[orphanCheck]] = await connection.execute(
      `
        SELECT COUNT(*) AS remaining_defendant_nodes
        FROM trial_defendant_nodes
            WHERE source_node_id = ?
    `,
      ["TEST-ATOMIC-C3-ROLLBACK-DEF-1"]
    );

    console.log(
      "Independent rollback defendant verification:",
      orphanCheck
    );

    console.log("Atomic rollback verification:", counts);

    if (
      Number(counts.trials) !== 0 ||
      Number(counts.defendant_nodes) !== 0 ||
      Number(counts.offence_nodes) !== 0 ||
      Number(orphanCheck.remaining_defendant_nodes) !== 0
 ) {
      throw new Error(
        "Atomic rollback verification failed: test records remain."
      );
    }

    console.log(
      "PASS: Failed transaction left no trial or XML relationships."
    );
  } finally {
    connection.release();
  }
}

async function runAtomicRollbackTest(verifiedPool) {
  const result = await importTrialWithTransaction(
    ROLLBACK_TEST_ITEM,
    {
      importId: null,
      allowMissingDefendant: true,
      allowMissingJudge: true,
      allowMissingOffence: true,
      insertXmlRelationships: true,
      connectionPool: verifiedPool,
    }
  );

  console.log("Atomic rollback test result:", result);

  if (result.status !== "FAILED") {
    throw new Error(
      `Expected FAILED, received ${result.status}`
    );
  }

  const errorMessage = result.errors?.join("; ") ?? "";

  if (!errorMessage.toLowerCase().includes("cannot be null")) {
    throw new Error(
      `Unexpected rollback failure reason: ${errorMessage}`
    );
  }

  console.log(
    "PASS: Invalid offence relationship triggered an import failure."
  );

  return result;
}

async function verifyCleanTestIdentifiers(verifiedPool) {
  const connection = await verifiedPool.getConnection();

  try {
    const [[result]] = await connection.execute(
      `
        SELECT COUNT(*) AS existing_records
        FROM trials
        WHERE source_case_id IN (?, ?)
      `,
      [SUCCESS_SOURCE_ID, ROLLBACK_SOURCE_ID]
    );

    if (result.existing_records !== 0) {
      throw new Error(
        "Preflight failed: atomic test identifiers already exist."
      );
    }

    console.log(
      "PASS: Both atomic test identifiers are unused."
    );
  } finally {
    connection.release();
  }
}

async function verifyCleanRelationshipIdentifiers(verifiedPool) {
  const connection = await verifiedPool.getConnection();

  try {
    const [[counts]] = await connection.execute(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM trial_defendant_nodes
            WHERE source_node_id IN (?, ?)
          ) AS defendant_nodes,
          (
            SELECT COUNT(*)
            FROM trial_offence_nodes
            WHERE source_node_id = ?
          ) AS offence_nodes
      `,
      [
        "TEST-ATOMIC-C3-DEF-1",
        "TEST-ATOMIC-C3-ROLLBACK-DEF-1",
        "TEST-ATOMIC-C3-OFF-1",
      ]
    );

    console.log(
      "Relationship identifier preflight:",
      counts
    );

    if (
      Number(counts.defendant_nodes) !== 0 ||
      Number(counts.offence_nodes) !== 0
    ) {
      throw new Error(
        "Preflight failed: atomic test relationship identifiers already exist."
      );
    }

    console.log(
      "PASS: All atomic test relationship identifiers are unused."
    );
  } finally {
    connection.release();
  }
}

async function verifyFinalCleanup(verifiedPool) {
  const connection = await verifiedPool.getConnection();

  try {
    const [[result]] = await connection.execute(
      `
        SELECT COUNT(*) AS remaining_trials
        FROM trials
        WHERE source_case_id IN (?, ?)
      `,
      [SUCCESS_SOURCE_ID, ROLLBACK_SOURCE_ID]
    );

    console.log("Final cleanup verification:", result);

    if (result.remaining_trials !== 0) {
      throw new Error(
        "Final cleanup failed: atomic test trials remain."
      );
    }

    console.log(
      "PASS: No atomic integration-test trials remain."
    );
  } finally {
    connection.release();
  }
}

async function verifyDatabaseBaseline(verifiedPool) {
  const connection = await verifiedPool.getConnection();

  try {
    const [[counts]] = await connection.execute(`
      SELECT
        (SELECT COUNT(*) FROM trials) AS trials,
        (SELECT COUNT(*) FROM trial_defendant_nodes)
          AS defendant_nodes,
        (SELECT COUNT(*) FROM trial_offence_nodes)
          AS offence_nodes,
        (SELECT COUNT(*) FROM trial_verdict_nodes)
          AS verdict_nodes,
        (SELECT COUNT(*) FROM trial_punishment_nodes)
          AS punishment_nodes,
        (SELECT COUNT(*) FROM criminal_charges)
          AS criminal_charges,
        (SELECT COUNT(*) FROM defendant_punishments)
          AS defendant_punishments
    `);

    for (const [table, expected] of Object.entries(
      EXPECTED_BASELINE
    )) {
      if (Number(counts[table]) !== expected) {
        throw new Error(
          `Database baseline mismatch for ${table}: ` +
          `expected ${expected}, found ${counts[table]}`
        );
      }
    }

    console.log(
      "PASS: All seven database tables match the baseline."
    );
  } finally {
    connection.release();
  }
}

async function executeAtomicIntegrationTests() {
  const testPool = createTestPool();
  const verifiedPool = createVerifiedTestPool(testPool);

  let preflightPassed = false;
  const errors = [];

  try {
    await verifyCleanTestIdentifiers(verifiedPool);
    await verifyCleanRelationshipIdentifiers(verifiedPool);
    await verifyDatabaseBaseline(verifiedPool);

    preflightPassed = true;

    await runSuccessfulAtomicImport(verifiedPool);
    await verifySuccessfulAtomicImport(verifiedPool);

    await runAtomicRollbackTest(verifiedPool);
    await verifyAtomicRollback(verifiedPool);

  } catch (error) {
    errors.push(error);
  } finally {
    if (preflightPassed) {
      try {
        await cleanupTestTrial(
          verifiedPool,
          SUCCESS_SOURCE_ID
        );
      } catch (error) {
        errors.push(
          new Error(`Cleanup failed: ${error.message}`)
        );
      }

      try {
        await verifyFinalCleanup(verifiedPool);
        await verifyDatabaseBaseline(verifiedPool);
      } catch (error) {
        errors.push(
          new Error(`Final verification failed: ${error.message}`)
        );
      }
    }

    try {
      await testPool.end();
    } catch (error) {
      errors.push(
        new Error(`Connection pool closure failed: ${error.message}`)
      );
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "Atomic integration testing encountered errors."
    );
  }
  console.log(
    "PASS: Atomic integration tests and final cleanup completed."
 );
}

if (process.argv.includes("--run-atomic-tests")) {
  executeAtomicIntegrationTests().catch((error) => {
    console.error(
      "Atomic integration testing failed:",
      error
    );

    process.exitCode = 1;
  });
}