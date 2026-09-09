import { pool } from "../../db.js";

export async function readTrialRelationships(trialId) {
  if (!Number.isInteger(trialId) || trialId <= 0) {
    throw new Error(
      `Invalid trial ID supplied to relationship reader: ${trialId}`
    );
  }

  const [defendants] = await pool.query(
    `
      SELECT
        id,
        trial_id,
        source_node_id,
        label,
        gender,
        age,
        label_type,
        label_value
      FROM trial_defendant_nodes
      WHERE trial_id = ?
      ORDER BY id
    `,
    [trialId]
  );

  const [offences] = await pool.query(
    `
      SELECT
        id,
        trial_id,
        source_node_id,
        category,
        subcategory,
        offence_text
      FROM trial_offence_nodes
      WHERE trial_id = ?
      ORDER BY id
    `,
    [trialId]
  );

  const [verdicts] = await pool.query(
    `
      SELECT
        id,
        trial_id,
        source_node_id,
        category,
        subcategory,
        plea,
        verdict_text
      FROM trial_verdict_nodes
      WHERE trial_id = ?
      ORDER BY id
    `,
    [trialId]
  );

  const [punishments] = await pool.query(
    `
      SELECT
        id,
        trial_id,
        source_node_id,
        category,
        subcategory,
        punishment_text
      FROM trial_punishment_nodes
      WHERE trial_id = ?
      ORDER BY id
    `,
    [trialId]
  );

  const [criminalCharges] = await pool.query(
  `
    SELECT
      id,
      trial_id,
      source_charge_id,
      defendant_source_node_id,
      offence_source_node_id,
      verdict_source_node_id,
      verdict_reference
    FROM criminal_charges
    WHERE trial_id = ?
    ORDER BY id
  `,
  [trialId]
);

const [defendantPunishments] = await pool.query(
  `
    SELECT
      id,
      trial_id,
      defendant_source_node_id,
      punishment_source_node_id
    FROM defendant_punishments
    WHERE trial_id = ?
    ORDER BY id
  `,
  [trialId]
);

const defendantsBySourceNodeId =
  new Map(
    defendants.map((defendant) => [
      defendant.source_node_id,
      defendant,
    ])
  );

const offencesBySourceNodeId =
  new Map(
    offences.map((offence) => [
      offence.source_node_id,
      offence,
    ])
  );

const verdictsBySourceNodeId =
  new Map(
    verdicts.map((verdict) => [
      verdict.source_node_id,
      verdict,
    ])
  );

  const resolvedCriminalCharges =
  criminalCharges.map((charge) => ({
    id: charge.id,
    sourceChargeId: charge.source_charge_id,

    defendant:
      defendantsBySourceNodeId.get(
        charge.defendant_source_node_id
      ) ?? null,

    offence:
      offencesBySourceNodeId.get(
        charge.offence_source_node_id
      ) ?? null,

    verdict:
      charge.verdict_source_node_id
        ? verdictsBySourceNodeId.get(
            charge.verdict_source_node_id
          ) ?? null
        : null,

    verdictReference:
      charge.verdict_reference,
  }));

  const punishmentsBySourceNodeId =
  new Map(
    punishments.map((punishment) => [
      punishment.source_node_id,
      punishment,
    ])
  );

  const resolvedDefendantPunishments =
  defendantPunishments.map((relationship) => ({
    id: relationship.id,

    defendant:
      defendantsBySourceNodeId.get(
        relationship.defendant_source_node_id
      ) ?? null,

    punishment:
      punishmentsBySourceNodeId.get(
        relationship.punishment_source_node_id
      ) ?? null,
  }));
  

    return {
    trialId,
    defendants,
    offences,
    verdicts,
    punishments,
    criminalCharges,
    defendantPunishments,
    resolvedCriminalCharges,
    resolvedDefendantPunishments,
    };
}

export async function checkTrialRelationshipIntegrity(trialId) {
  const relationships =
    await readTrialRelationships(trialId);

  const issues = [];

  for (
    const charge of
    relationships.resolvedCriminalCharges
  ) {
    if (!charge.defendant) {
      issues.push({
        type: "MISSING_CHARGE_DEFENDANT",
        sourceChargeId: charge.sourceChargeId,
      });
    }

    if (!charge.offence) {
      issues.push({
        type: "MISSING_CHARGE_OFFENCE",
        sourceChargeId: charge.sourceChargeId,
      });
    }

    const hasExpectedVerdict =
      charge.verdictReference != null &&
      charge.verdictReference !== "NOVERDICTR";

    if (
      hasExpectedVerdict &&
      !charge.verdict
    ) {
      issues.push({
        type: "MISSING_EXPECTED_VERDICT",
        sourceChargeId: charge.sourceChargeId,
        verdictReference:
          charge.verdictReference,
      });
    }
  }

  for (
    const relationship of
    relationships.resolvedDefendantPunishments
  ) {
    if (!relationship.defendant) {
      issues.push({
        type: "MISSING_PUNISHMENT_DEFENDANT",
        relationshipId: relationship.id,
      });
    }

    if (!relationship.punishment) {
      issues.push({
        type: "MISSING_PUNISHMENT_NODE",
        relationshipId: relationship.id,
      });
    }
  }

  return {
    trialId,
    isValid: issues.length === 0,
    issues,
  };
}