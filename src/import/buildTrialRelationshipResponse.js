export function buildTrialRelationshipResponse({
  trial,
  relationships,
}) {
  if (!trial) {
    throw new Error("Trial is required");
  }

  if (!relationships) {
    throw new Error("Relationships are required");
  }

  const charges =
    relationships.resolvedCriminalCharges.map(
      (charge) => ({
        sourceChargeId:
          charge.sourceChargeId,

        defendant: charge.defendant
          ? {
              sourceNodeId:
                charge.defendant.source_node_id,
              name:
                charge.defendant.label,
              gender:
                charge.defendant.gender,
              age:
                charge.defendant.age,
              labelType:
                charge.defendant.label_type,
              labelValue:
                charge.defendant.label_value,
            }
          : null,

        offence: charge.offence
          ? {
              sourceNodeId:
                charge.offence.source_node_id,
              category:
                charge.offence.category,
              subcategory:
                charge.offence.subcategory,
              text:
                charge.offence.offence_text,
            }
          : null,

        verdict: charge.verdict
          ? {
              sourceNodeId:
                charge.verdict.source_node_id,
              category:
                charge.verdict.category,
              subcategory:
                charge.verdict.subcategory,
              plea:
                charge.verdict.plea,
              text:
                charge.verdict.verdict_text,
            }
          : null,

        verdictReference:
          charge.verdictReference,
      }),
    );

  const punishments =
    relationships.resolvedDefendantPunishments.map(
      (relationship) => ({
        defendant: relationship.defendant
          ? {
              sourceNodeId:
                relationship.defendant.source_node_id,
              name:
                relationship.defendant.label,
              gender:
                relationship.defendant.gender,
            }
          : null,

        punishment: relationship.punishment
          ? {
              sourceNodeId:
                relationship.punishment.source_node_id,
              category:
                relationship.punishment.category,
              subcategory:
                relationship.punishment.subcategory,
              text:
                relationship.punishment.punishment_text,
            }
          : null,
      }),
    );

  return {
    trial: {
      id: trial.id,
      sourceCaseId: trial.source_case_id,
      trialDate: trial.trial_date,
      defendantName: trial.defendant_name,
      offence: trial.offence,
      verdict: trial.verdict,
    },

    relationships: {
      charges,
      punishments,
    },
  };
}