export function validateParsedXmlRelationships(parsedXmlData) {
  const issues = [];

  const defendantIds = new Set(
    parsedXmlData.defendants.map((defendant) => defendant.id)
  );

  const offenceIds = new Set(
    parsedXmlData.offences.map((offence) => offence.id)
  );

  const verdictIds = new Set(
    parsedXmlData.verdicts.map((verdict) => verdict.id)
  );

  const punishmentIds = new Set(
    parsedXmlData.punishments.map((punishment) => punishment.id)
  );

  for (const charge of parsedXmlData.criminalCharges) {
    if (!defendantIds.has(charge.defendantId)) {
      issues.push({
        type: "MISSING_CHARGE_DEFENDANT",
        sourceChargeId: charge.id,
        defendantId: charge.defendantId,
      });
    }
    if (!offenceIds.has(charge.offenceId)) {
      issues.push({
        type: "MISSING_CHARGE_OFFENCE",
        sourceChargeId: charge.id,
        offenceId: charge.offenceId,
      });
   }

   const hasExpectedVerdict =
     charge.verdictReference != null &&
     charge.verdictReference !== "NOVERDICTR";

    if (
      hasExpectedVerdict &&
      !verdictIds.has(charge.verdictReference)
        ) {
      issues.push({
        type: "MISSING_EXPECTED_VERDICT",
        sourceChargeId: charge.id,
        verdictReference: charge.verdictReference,
     });
    }
  }

    for (const relationship of parsedXmlData.defendantPunishments) {
      if (!defendantIds.has(relationship.defendantId)) {
       issues.push({
         type: "MISSING_PUNISHMENT_DEFENDANT",
         defendantId: relationship.defendantId,
         punishmentId: relationship.punishmentId,
     });
    }
      if (!punishmentIds.has(relationship.punishmentId)) {
        issues.push({
          type: "MISSING_PUNISHMENT_NODE",
          defendantId: relationship.defendantId,
          punishmentId: relationship.punishmentId,
     });
    }
    }

  return {
    isValid: issues.length === 0,
    issues,
  };
}