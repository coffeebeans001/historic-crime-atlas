import test from "node:test";
import assert from "node:assert/strict";
import { validateParsedXmlRelationships } from "../src/import/validateParsedXmlRelationships.js";

test("detects a criminal charge referencing a missing defendant", () => {
  const parsedXml = {
    defendants: [{ id: "defend1" }],
    offences: [{ id: "offence1" }],
    verdicts: [{ id: "verdict1" }],
    punishments: [],
    criminalCharges: [
      {
        id: "charge1",
        defendantId: "defend99",
        offenceId: "offence1",
        verdictId: "verdict1",
        verdictReference: "verdict1",
      },
    ],
    defendantPunishments: [],
  };

  const result = validateParsedXmlRelationships(parsedXml);

  assert.equal(result.isValid, false);

  assert.deepEqual(result.issues, [
    {
      type: "MISSING_CHARGE_DEFENDANT",
      sourceChargeId: "charge1",
      defendantId: "defend99",
    },
  ]);
});

test("detects a criminal charge referencing a missing offence", () => {
  const parsedXml = {
    defendants: [{ id: "defend1" }],
    offences: [{ id: "offence1" }],
    verdicts: [{ id: "verdict1" }],
    punishments: [],
    criminalCharges: [
      {
        id: "charge1",
        defendantId: "defend1",
        offenceId: "offence99",
        verdictId: "verdict1",
        verdictReference: "verdict1",
      },
    ],
    defendantPunishments: [],
  };

  const result = validateParsedXmlRelationships(parsedXml);

  assert.equal(result.isValid, false);

  assert.deepEqual(result.issues, [
    {
      type: "MISSING_CHARGE_OFFENCE",
      sourceChargeId: "charge1",
      offenceId: "offence99",
    },
  ]);
});

test("detects a criminal charge referencing a missing verdict", () => {
  const parsedXml = {
    defendants: [{ id: "defend1" }],
    offences: [{ id: "offence1" }],
    verdicts: [{ id: "verdict1" }],
    punishments: [],
    criminalCharges: [
      {
        id: "charge1",
        defendantId: "defend1",
        offenceId: "offence1",
        verdictId: "verdict99",
        verdictReference: "verdict99",
      },
    ],
    defendantPunishments: [],
  };

  const result = validateParsedXmlRelationships(parsedXml);

  assert.equal(result.isValid, false);

  assert.deepEqual(result.issues, [
    {
      type: "MISSING_EXPECTED_VERDICT",
      sourceChargeId: "charge1",
      verdictReference: "verdict99",
    },
  ]);
});

test("accepts explicitly unrecorded verdict references", () => {
  const parsedXml = {
    defendants: [{ id: "defend1" }],
    offences: [{ id: "offence1" }],
    verdicts: [],
    punishments: [],
    criminalCharges: [
      {
        id: "charge1",
        defendantId: "defend1",
        offenceId: "offence1",
        verdictId: null,
        verdictReference: "NOVERDICTR",
      },
    ],
    defendantPunishments: [],
  };

  const result = validateParsedXmlRelationships(parsedXml);

  assert.equal(result.isValid, true);
  assert.deepEqual(result.issues, []);
});

test("detects a punishment referencing a missing defendant", () => {
  const parsedXml = {
    defendants: [{ id: "defend1" }],
    offences: [],
    verdicts: [],
    punishments: [{ id: "punishment1" }],
    criminalCharges: [],
    defendantPunishments: [
      {
        defendantId: "defend99",
        punishmentId: "punishment1",
      },
    ],
  };

  const result = validateParsedXmlRelationships(parsedXml);

  assert.equal(result.isValid, false);

  assert.deepEqual(result.issues, [
    {
      type: "MISSING_PUNISHMENT_DEFENDANT",
      defendantId: "defend99",
      punishmentId: "punishment1",
    },
  ]);
});

test("detects a punishment relationship referencing a missing punishment", () => {
  const parsedXml = {
    defendants: [{ id: "defend1" }],
    offences: [],
    verdicts: [],
    punishments: [{ id: "punishment1" }],
    criminalCharges: [],
    defendantPunishments: [
      {
        defendantId: "defend1",
        punishmentId: "punishment99",
      },
    ],
  };

  const result = validateParsedXmlRelationships(parsedXml);

  assert.equal(result.isValid, false);

  assert.deepEqual(result.issues, [
    {
      type: "MISSING_PUNISHMENT_NODE",
      defendantId: "defend1",
      punishmentId: "punishment99",
    },
  ]);
});