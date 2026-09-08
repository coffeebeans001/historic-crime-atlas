import { pool } from "../../db.js";

export default async function writeTrialRelationships({
  trialId,
  parsedXmlData,
  insert = false,
}) {
  if (!trialId) {
    throw new Error(
      "writeTrialRelationships requires a trialId."
    );
  }

  if (!parsedXmlData) {
    throw new Error(
      "writeTrialRelationships requires parsedXmlData."
    );
  }

  const defendants =
    parsedXmlData.defendants ?? [];

  const offences =
    parsedXmlData.offences ?? [];

  const verdicts =
    parsedXmlData.verdicts ?? [];

  const punishments =
    parsedXmlData.punishments ?? [];

  const criminalCharges =
    parsedXmlData.criminalCharges ?? [];

  const defendantPunishments =
    parsedXmlData.defendantPunishments ?? [];

  const preparedRows = {
    defendantNodes: defendants.map((defendant) => ({
      trialId,
      sourceNodeId: defendant.id,
      label: defendant.label,
      gender: defendant.gender,
      age: defendant.age,
      labelType: defendant.labelType,
      labelValue: defendant.labelValue,
    })),

    offenceNodes: offences.map((offence) => ({
      trialId,
      sourceNodeId: offence.id,
      category: offence.category,
      subcategory: offence.subcategory,
      offenceText: offence.text,
    })),

    verdictNodes: verdicts.map((verdict) => ({
      trialId,
      sourceNodeId: verdict.id,
      category: verdict.category,
      subcategory: verdict.subcategory,
      plea: verdict.plea,
      verdictText: verdict.text,
    })),

    punishmentNodes: punishments.map((punishment) => ({
      trialId,
      sourceNodeId: punishment.id,
      category: punishment.category,
      subcategory: punishment.subcategory,
      punishmentText: punishment.text,
    })),

    criminalCharges: criminalCharges.map((charge) => ({
      trialId,
      sourceChargeId: charge.id,
      defendantSourceNodeId: charge.defendantId,
      offenceSourceNodeId: charge.offenceId,
      verdictSourceNodeId: charge.verdictId,
      verdictReference: charge.verdictReference,
    })),

    defendantPunishments: defendantPunishments.map(
      (relationship) => ({
        trialId,
        defendantSourceNodeId:
          relationship.defendantId,
        punishmentSourceNodeId:
          relationship.punishmentId,
      })
    ),
  };

  const summary = {
    trialId,
    insertEnabled: insert,

    defendantNodes:
      preparedRows.defendantNodes.length,

    offenceNodes:
      preparedRows.offenceNodes.length,

    verdictNodes:
      preparedRows.verdictNodes.length,

    punishmentNodes:
      preparedRows.punishmentNodes.length,

    criminalCharges:
      preparedRows.criminalCharges.length,

    defendantPunishments:
      preparedRows.defendantPunishments.length,

    totalRows:
      preparedRows.defendantNodes.length +
      preparedRows.offenceNodes.length +
      preparedRows.verdictNodes.length +
      preparedRows.punishmentNodes.length +
      preparedRows.criminalCharges.length +
      preparedRows.defendantPunishments.length,
  };

  /*
   * V1.5 first implementation:
   *
   * Deliberately no INSERT statements yet.
   *
   * We first prove that the parsed graph maps cleanly
   * onto the relational schema.
   */
  if (!insert) {
  return {
    preparedRows,
    summary,
  };
}

const connection = await pool.getConnection();

try {
  await connection.beginTransaction();

  for (const row of preparedRows.defendantNodes) {
    await connection.execute(
      `
        INSERT INTO trial_defendant_nodes (
          trial_id,
          source_node_id,
          label,
          gender,
          age,
          label_type,
          label_value
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.trialId,
        row.sourceNodeId,
        row.label,
        row.gender,
        row.age,
        row.labelType,
        row.labelValue,
      ]
    );
  }

  for (const row of preparedRows.offenceNodes) {
    await connection.execute(
      `
        INSERT INTO trial_offence_nodes (
          trial_id,
          source_node_id,
          category,
          subcategory,
          offence_text
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        row.trialId,
        row.sourceNodeId,
        row.category,
        row.subcategory,
        row.offenceText,
      ]
    );
  }

  for (const row of preparedRows.verdictNodes) {
    await connection.execute(
      `
        INSERT INTO trial_verdict_nodes (
          trial_id,
          source_node_id,
          category,
          subcategory,
          plea,
          verdict_text
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        row.trialId,
        row.sourceNodeId,
        row.category,
        row.subcategory,
        row.plea,
        row.verdictText,
      ]
    );
  }

  for (const row of preparedRows.punishmentNodes) {
    await connection.execute(
      `
        INSERT INTO trial_punishment_nodes (
          trial_id,
          source_node_id,
          category,
          subcategory,
          punishment_text
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        row.trialId,
        row.sourceNodeId,
        row.category,
        row.subcategory,
        row.punishmentText,
      ]
    );
  }

  for (const row of preparedRows.criminalCharges) {
    await connection.execute(
      `
        INSERT INTO criminal_charges (
          trial_id,
          source_charge_id,
          defendant_source_node_id,
          offence_source_node_id,
          verdict_source_node_id,
          verdict_reference
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        row.trialId,
        row.sourceChargeId,
        row.defendantSourceNodeId,
        row.offenceSourceNodeId,
        row.verdictSourceNodeId,
        row.verdictReference,
      ]
    );
  }

  for (
    const row of preparedRows.defendantPunishments
  ) {
    await connection.execute(
      `
        INSERT INTO defendant_punishments (
          trial_id,
          defendant_source_node_id,
          punishment_source_node_id
        )
        VALUES (?, ?, ?)
      `,
      [
        row.trialId,
        row.defendantSourceNodeId,
        row.punishmentSourceNodeId,
      ]
    );
  }

  await connection.commit();

  return {
    preparedRows,
    summary: {
      ...summary,
      inserted: true,
    },
  };
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
}
}

export async function checkRelationshipBackfillReadiness({
  sourceCaseId,
  parsedXmlData,
}) {
  const expectedCounts = {
    defendantNodes:
      parsedXmlData?.defendants?.length ?? 0,

    offenceNodes:
      parsedXmlData?.offences?.length ?? 0,

    verdictNodes:
      parsedXmlData?.verdicts?.length ?? 0,

    punishmentNodes:
      parsedXmlData?.punishments?.length ?? 0,

    criminalCharges:
      parsedXmlData?.criminalCharges?.length ?? 0,

    defendantPunishments:
      parsedXmlData?.defendantPunishments?.length ?? 0,
  };

  if (!sourceCaseId) {
    return {
      sourceCaseId: null,
      trialId: null,
      resolved: false,
      status: "unresolved",
      ready: false,
      expectedCounts,
      actualCounts: null,
    };
  }

  const [trialRows] = await pool.execute(
    `
      SELECT id
      FROM trials
      WHERE source_case_id = ?
      LIMIT 1
    `,
    [sourceCaseId]
  );

  if (trialRows.length === 0) {
    return {
      sourceCaseId,
      trialId: null,
      resolved: false,
      status: "unresolved",
      ready: false,
      expectedCounts,
      actualCounts: null,
    };
  }

  const trialId = trialRows[0].id;

  const [
    defendantRows,
    offenceRows,
    verdictRows,
    punishmentRows,
    chargeRows,
    defendantPunishmentRows,
  ] = await Promise.all([
    pool.execute(
      `
        SELECT COUNT(*) AS count
        FROM trial_defendant_nodes
        WHERE trial_id = ?
      `,
      [trialId]
    ),

    pool.execute(
      `
        SELECT COUNT(*) AS count
        FROM trial_offence_nodes
        WHERE trial_id = ?
      `,
      [trialId]
    ),

    pool.execute(
      `
        SELECT COUNT(*) AS count
        FROM trial_verdict_nodes
        WHERE trial_id = ?
      `,
      [trialId]
    ),

    pool.execute(
      `
        SELECT COUNT(*) AS count
        FROM trial_punishment_nodes
        WHERE trial_id = ?
      `,
      [trialId]
    ),

    pool.execute(
      `
        SELECT COUNT(*) AS count
        FROM criminal_charges
        WHERE trial_id = ?
      `,
      [trialId]
    ),

    pool.execute(
      `
        SELECT COUNT(*) AS count
        FROM defendant_punishments
        WHERE trial_id = ?
      `,
      [trialId]
    ),
  ]);

  const actualCounts = {
    defendantNodes:
      Number(defendantRows[0][0]?.count ?? 0),

    offenceNodes:
      Number(offenceRows[0][0]?.count ?? 0),

    verdictNodes:
      Number(verdictRows[0][0]?.count ?? 0),

    punishmentNodes:
      Number(punishmentRows[0][0]?.count ?? 0),

    criminalCharges:
      Number(chargeRows[0][0]?.count ?? 0),

    defendantPunishments:
      Number(
        defendantPunishmentRows[0][0]?.count ?? 0
      ),
  };

  const expectedValues =
    Object.values(expectedCounts);

  const actualValues =
    Object.values(actualCounts);

  const allActualZero =
    actualValues.every((count) => count === 0);

  const countsMatch =
    Object.keys(expectedCounts).every(
      (key) =>
        expectedCounts[key] === actualCounts[key]
    );

  let status;

  if (allActualZero) {
    status = "ready";
  } else if (countsMatch) {
    status = "complete";
  } else {
    status = "partial";
  }

  return {
    sourceCaseId,
    trialId,
    resolved: true,
    status,
    ready: status === "ready",
    alreadyBackfilled: status === "complete",
    expectedCounts,
    actualCounts,
    expectedTotal:
      expectedValues.reduce(
        (sum, count) => sum + count,
        0
      ),
    actualTotal:
      actualValues.reduce(
        (sum, count) => sum + count,
        0
      ),
  };
}