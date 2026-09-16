import { pool } from "../db.js";

async function runDatabaseHealthReport() {
  try {
    console.log("\n========== V1.5 DATABASE HEALTH REPORT ==========\n");

    console.log(
      "Audit mode: READ ONLY"
    );

    console.log(
      "Database changes: 0\n"
    );

   const [[trialPopulation]] =
  await pool.query(`
    SELECT
      COUNT(*) AS totalTrials,

      SUM(
        CASE
          WHEN latitude IS NOT NULL
           AND longitude IS NOT NULL
          THEN 1
          ELSE 0
        END
      ) AS mappedTrials,

      SUM(
        CASE
          WHEN latitude IS NULL
            OR longitude IS NULL
          THEN 1
          ELSE 0
        END
      ) AS unmappedTrials
    FROM trials
  `);

console.log("========== TRIAL POPULATION ==========\n");

console.log(
  "Total trials:",
  trialPopulation.totalTrials
);

console.log(
  "Mapped trials:",
  trialPopulation.mappedTrials
);

console.log(
  "Unmapped trials:",
  trialPopulation.unmappedTrials
);

const [[coreCoverage]] =
  await pool.query(`
    SELECT
      COUNT(*) AS totalTrials,

      SUM(
        CASE
          WHEN source_case_id IS NOT NULL
          THEN 1 ELSE 0
        END
      ) AS sourceCaseId,

      SUM(
        CASE
          WHEN transcript_text IS NOT NULL
          THEN 1 ELSE 0
        END
      ) AS transcriptText,

      SUM(
        CASE
          WHEN offence_category IS NOT NULL
          THEN 1 ELSE 0
        END
      ) AS offenceCategory,

      SUM(
        CASE
          WHEN defendant_gender IS NOT NULL
          THEN 1 ELSE 0
        END
      ) AS defendantGender,

      SUM(
        CASE
          WHEN verdict IS NOT NULL
          THEN 1 ELSE 0
        END
      ) AS verdict
    FROM trials
  `);

console.log(
  "\n========== CORE FIELD COVERAGE ==========\n"
);

console.log(
  "Source case ID:",
  `${coreCoverage.sourceCaseId}/${coreCoverage.totalTrials}`
);

console.log(
  "Transcript text:",
  `${coreCoverage.transcriptText}/${coreCoverage.totalTrials}`
);

console.log(
  "Offence category:",
  `${coreCoverage.offenceCategory}/${coreCoverage.totalTrials}`
);

console.log(
  "Defendant gender:",
  `${coreCoverage.defendantGender}/${coreCoverage.totalTrials}`
);

console.log(
  "Verdict:",
  `${coreCoverage.verdict}/${coreCoverage.totalTrials}`
);

const [duplicateSourceIds] =
  await pool.query(`
    SELECT
      source_case_id,
      COUNT(*) AS duplicateCount
    FROM trials
    WHERE source_case_id IS NOT NULL
    GROUP BY source_case_id
    HAVING COUNT(*) > 1
  `);

console.log("\n========== SOURCE ID INTEGRITY ==========\n"
);

console.log(
  "Duplicate source_case_id groups:",
  duplicateSourceIds.length
);

const [[relationshipCounts]] =
  await pool.query(`
    SELECT
      (
        SELECT COUNT(*)
        FROM trial_defendant_nodes
      ) AS defendantNodes,

      (
        SELECT COUNT(*)
        FROM trial_offence_nodes
      ) AS offenceNodes,

      (
        SELECT COUNT(*)
        FROM trial_verdict_nodes
      ) AS verdictNodes,

      (
        SELECT COUNT(*)
        FROM trial_punishment_nodes
      ) AS punishmentNodes,

      (
        SELECT COUNT(*)
        FROM criminal_charges
      ) AS criminalCharges
  `);

console.log(
  "\n========== RELATIONAL ROW COUNTS ==========\n"
);

console.log(
  "Defendant nodes:",
  relationshipCounts.defendantNodes
);

console.log(
  "Offence nodes:",
  relationshipCounts.offenceNodes
);

console.log(
  "Verdict nodes:",
  relationshipCounts.verdictNodes
);

console.log(
  "Punishment nodes:",
  relationshipCounts.punishmentNodes
);

console.log(
  "Criminal charges:",
  relationshipCounts.criminalCharges
);

const [[relationshipCoverage]] =
  await pool.query(`
    SELECT
      COUNT(*) AS totalTrials,

      SUM(
        CASE WHEN EXISTS (
          SELECT 1
          FROM trial_defendant_nodes tdn
          WHERE tdn.trial_id = t.id
        )
        THEN 1 ELSE 0 END
      ) AS withDefendantNodes,

      SUM(
        CASE WHEN EXISTS (
          SELECT 1
          FROM trial_offence_nodes ton
          WHERE ton.trial_id = t.id
        )
        THEN 1 ELSE 0 END
      ) AS withOffenceNodes,

      SUM(
        CASE WHEN EXISTS (
          SELECT 1
          FROM trial_verdict_nodes tvn
          WHERE tvn.trial_id = t.id
        )
        THEN 1 ELSE 0 END
      ) AS withVerdictNodes,

      SUM(
        CASE WHEN EXISTS (
          SELECT 1
          FROM trial_punishment_nodes tpn
          WHERE tpn.trial_id = t.id
        )
        THEN 1 ELSE 0 END
      ) AS withPunishmentNodes,

      SUM(
        CASE WHEN EXISTS (
          SELECT 1
          FROM criminal_charges cc
          WHERE cc.trial_id = t.id
        )
        THEN 1 ELSE 0 END
      ) AS withCriminalCharges

    FROM trials t
  `);

console.log(
  "\n========== TRIAL RELATIONAL COVERAGE ==========\n"
);

console.log(
  "Trials:",
  relationshipCoverage.totalTrials
);

console.log(
  "With defendant nodes:",
  relationshipCoverage.withDefendantNodes
);

console.log(
  "With offence nodes:",
  relationshipCoverage.withOffenceNodes
);

console.log(
  "With verdict nodes:",
  relationshipCoverage.withVerdictNodes
);

console.log(
  "With punishment nodes:",
  relationshipCoverage.withPunishmentNodes
);

console.log(
  "With criminal charges:",
  relationshipCoverage.withCriminalCharges
);

const [[trialReferenceIntegrity]] =
  await pool.query(`
    SELECT
      (
        SELECT COUNT(*)
        FROM trial_defendant_nodes tdn
        LEFT JOIN trials t
          ON t.id = tdn.trial_id
        WHERE t.id IS NULL
      ) AS orphanDefendantNodes,

      (
        SELECT COUNT(*)
        FROM trial_offence_nodes ton
        LEFT JOIN trials t
          ON t.id = ton.trial_id
        WHERE t.id IS NULL
      ) AS orphanOffenceNodes,

      (
        SELECT COUNT(*)
        FROM trial_verdict_nodes tvn
        LEFT JOIN trials t
          ON t.id = tvn.trial_id
        WHERE t.id IS NULL
      ) AS orphanVerdictNodes,

      (
        SELECT COUNT(*)
        FROM trial_punishment_nodes tpn
        LEFT JOIN trials t
          ON t.id = tpn.trial_id
        WHERE t.id IS NULL
      ) AS orphanPunishmentNodes,

      (
        SELECT COUNT(*)
        FROM criminal_charges cc
        LEFT JOIN trials t
          ON t.id = cc.trial_id
        WHERE t.id IS NULL
      ) AS orphanCriminalCharges
  `);

console.log(
  "\n========== RELATIONAL TRIAL REFERENCE INTEGRITY ==========\n"
);

console.log(
  "Orphan defendant nodes:",
  trialReferenceIntegrity.orphanDefendantNodes
);

console.log(
  "Orphan offence nodes:",
  trialReferenceIntegrity.orphanOffenceNodes
);

console.log(
  "Orphan verdict nodes:",
  trialReferenceIntegrity.orphanVerdictNodes
);

console.log(
  "Orphan punishment nodes:",
  trialReferenceIntegrity.orphanPunishmentNodes
);

console.log(
  "Orphan criminal charges:",
  trialReferenceIntegrity.orphanCriminalCharges
);

const [[chargeReferenceIntegrity]] =
  await pool.query(`
    SELECT
      SUM(
        CASE
          WHEN cc.defendant_source_node_id IS NOT NULL
           AND tdn.id IS NULL
          THEN 1 ELSE 0
        END
      ) AS missingDefendantReferences,

      SUM(
        CASE
          WHEN cc.offence_source_node_id IS NOT NULL
           AND ton.id IS NULL
          THEN 1 ELSE 0
        END
      ) AS missingOffenceReferences,

      SUM(
        CASE
          WHEN cc.verdict_source_node_id IS NOT NULL
           AND tvn.id IS NULL
          THEN 1 ELSE 0
        END
      ) AS missingVerdictReferences

    FROM criminal_charges cc

    LEFT JOIN trial_defendant_nodes tdn
      ON tdn.trial_id = cc.trial_id
     AND tdn.source_node_id =
         cc.defendant_source_node_id

    LEFT JOIN trial_offence_nodes ton
      ON ton.trial_id = cc.trial_id
     AND ton.source_node_id =
         cc.offence_source_node_id

    LEFT JOIN trial_verdict_nodes tvn
      ON tvn.trial_id = cc.trial_id
     AND tvn.source_node_id =
         cc.verdict_source_node_id
  `);

  console.log(
  "\n========== CRIMINAL CHARGE REFERENCE INTEGRITY ==========\n"
);

console.log(
  "Missing defendant references:",
  chargeReferenceIntegrity.missingDefendantReferences
);

console.log(
  "Missing offence references:",
  chargeReferenceIntegrity.missingOffenceReferences
);

console.log(
  "Missing verdict references:",
  chargeReferenceIntegrity.missingVerdictReferences
);

const [[knownGaps]] =
  await pool.query(`
    SELECT
      COUNT(*) AS totalTrials,

      SUM(
        CASE
          WHEN transcript_text IS NULL
          THEN 1 ELSE 0
        END
      ) AS missingTranscript,

      SUM(
        CASE
          WHEN offence_category IS NULL
          THEN 1 ELSE 0
        END
      ) AS missingOffenceCategory,

      SUM(
        CASE
          WHEN defendant_gender IS NULL
          THEN 1 ELSE 0
        END
      ) AS missingDefendantGender,

      SUM(
        CASE
          WHEN verdict IS NULL
          THEN 1 ELSE 0
        END
      ) AS missingVerdict

    FROM trials
  `);

console.log(
  "\n========== DATA COMPLETENESS GAPS ==========\n"
);

console.log(
  "Trials:",
  knownGaps.totalTrials
);

console.log(
  "Missing transcript:",
  knownGaps.missingTranscript
);

console.log(
  "Missing offence category:",
  knownGaps.missingOffenceCategory
);

console.log(
  "Missing defendant gender:",
  knownGaps.missingDefendantGender
);

console.log(
  "Missing verdict:",
  knownGaps.missingVerdict
);

const [verdictCoverageMismatch] =
  await pool.query(`
    SELECT
      t.id,
      t.source_case_id,
      t.verdict,

      CASE
        WHEN EXISTS (
          SELECT 1
          FROM trial_verdict_nodes tvn
          WHERE tvn.trial_id = t.id
        )
        THEN 1
        ELSE 0
      END AS hasVerdictNode

    FROM trials t

    WHERE
      (
        t.verdict IS NULL
        AND EXISTS (
          SELECT 1
          FROM trial_verdict_nodes tvn
          WHERE tvn.trial_id = t.id
        )
      )
      OR
      (
        t.verdict IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM trial_verdict_nodes tvn
          WHERE tvn.trial_id = t.id
        )
      )
  `);

console.log(
  "\n========== VERDICT COVERAGE RECONCILIATION ==========\n"
);

console.log(
  "Flat/relational coverage mismatches:",
  verdictCoverageMismatch.length
);

console.log(
  "\nDatabase changes: 0"
);


  } catch (error) {
    console.error(
      "Database health report failed:",
      error
    );

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runDatabaseHealthReport();



