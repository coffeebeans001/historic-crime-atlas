import test from "node:test";
import assert from "node:assert/strict";

import { parseOldBaileyXml } from "../src/import/parseOldBaileyXml.js";

test("parses multiple defendants from Old Bailey XML", () => {
  const xml = `
    <div>
      <persName id="defend1" type="defendantName">
        John Smith
        <interp inst="defend1" type="gender" value="male"/>
      </persName>

      <persName id="defend2" type="defendantName">
        Mary Jones
        <interp inst="defend2" type="gender" value="female"/>
      </persName>
    </div>
  `;

  const result = parseOldBaileyXml(xml);

  assert.equal(result.defendants.length, 2);

  assert.equal(result.defendants[0].id, "defend1");
  assert.equal(result.defendants[1].id, "defend2");

  assert.equal(result.defendants[0].gender, "male");
  assert.equal(result.defendants[1].gender, "female");
});

test("parses multiple offences from Old Bailey XML", () => {
  const xml = `
    <div>
      <rs id="offence1" type="offenceDescription">
        <interp inst="offence1" type="offenceCategory" value="theft"/>
        <interp inst="offence1" type="offenceSubcategory" value="grandLarceny"/>
        Stealing goods
      </rs>

      <rs id="offence2" type="offenceDescription">
        <interp inst="offence2" type="offenceCategory" value="violentTheft"/>
        <interp inst="offence2" type="offenceSubcategory" value="highwayRobbery"/>
        Robbery on the highway
      </rs>
    </div>
  `;

  const result = parseOldBaileyXml(xml);

  assert.equal(result.offences.length, 2);

  assert.equal(result.offences[0].id, "offence1");
  assert.equal(result.offences[1].id, "offence2");

  assert.equal(result.offences[0].category, "theft");
  assert.equal(result.offences[1].category, "violentTheft");
});

test("parses multiple verdicts from Old Bailey XML", () => {
  const xml = `
    <div>
      <rs id="verdict1" type="verdictDescription">
        <interp inst="verdict1" type="verdictCategory" value="guilty"/>
        <interp inst="verdict1" type="verdictSubcategory" value="guiltyNoDetail"/>
        Guilty
      </rs>

      <rs id="verdict2" type="verdictDescription">
        <interp inst="verdict2" type="verdictCategory" value="notGuilty"/>
        <interp inst="verdict2" type="verdictSubcategory" value="notGuilty"/>
        Not Guilty
      </rs>
    </div>
  `;

  const result = parseOldBaileyXml(xml);

  assert.equal(result.verdicts.length, 2);

  assert.equal(result.verdicts[0].id, "verdict1");
  assert.equal(result.verdicts[1].id, "verdict2");

  assert.equal(result.verdicts[0].category, "guilty");
  assert.equal(result.verdicts[1].category, "notGuilty");
});

test("parses multiple punishments from Old Bailey XML", () => {
  const xml = `
    <div>
      <rs id="punishment1" type="punishmentDescription">
        <interp inst="punishment1" type="punishmentCategory" value="transport"/>
        <interp inst="punishment1" type="punishmentSubcategory" value="transport"/>
        Transportation
      </rs>

      <rs id="punishment2" type="punishmentDescription">
        <interp inst="punishment2" type="punishmentCategory" value="imprison"/>
        <interp inst="punishment2" type="punishmentSubcategory" value="imprison"/>
        Imprisonment
      </rs>
    </div>
  `;

  const result = parseOldBaileyXml(xml);

  assert.equal(result.punishments.length, 2);

  assert.equal(result.punishments[0].id, "punishment1");
  assert.equal(result.punishments[1].id, "punishment2");

  assert.equal(result.punishments[0].category, "transport");
  assert.equal(result.punishments[1].category, "imprison");
});

test("preserves individual defendant offence verdict relationships", () => {
  const xml = `
    <div>
      <join
        id="charge1"
        result="criminalCharge"
        targets="defend1 offence1 verdict1"
      />

      <join
        id="charge2"
        result="criminalCharge"
        targets="defend2 offence2 verdict2"
      />
    </div>
  `;

  const result = parseOldBaileyXml(xml);

  assert.equal(result.criminalCharges.length, 2);

  assert.deepEqual(result.criminalCharges[0], {
    id: "charge1",
    defendantId: "defend1",
    offenceId: "offence1",
    verdictId: "verdict1",
    verdictReference: "verdict1",
  });

  assert.deepEqual(result.criminalCharges[1], {
    id: "charge2",
    defendantId: "defend2",
    offenceId: "offence2",
    verdictId: "verdict2",
    verdictReference: "verdict2",
  });
});

test("preserves explicitly unrecorded verdict references", () => {
  const xml = `
    <div>
      <join
        id="charge1"
        result="criminalCharge"
        targets="defend1 offence1 NOVERDICTR"
      />
    </div>
  `;

  const result = parseOldBaileyXml(xml);

  assert.equal(result.criminalCharges.length, 1);

  assert.deepEqual(result.criminalCharges[0], {
    id: "charge1",
    defendantId: "defend1",
    offenceId: "offence1",
    verdictId: null,
    verdictReference: "NOVERDICTR",
  });
});

test("preserves unique defendant punishment relationships", () => {
  const xml = `
    <div>
      <join
        result="defendantPunishment"
        targets="defend1 punishment1"
      />

      <join
        result="defendantPunishment"
        targets="defend2 punishment2"
      />

      <join
        result="defendantPunishment"
        targets="defend1 punishment1"
      />
    </div>
  `;

  const result = parseOldBaileyXml(xml);

  assert.equal(result.defendantPunishments.length, 2);

  assert.deepEqual(result.defendantPunishments[0], {
    defendantId: "defend1",
    punishmentId: "punishment1",
  });

  assert.deepEqual(result.defendantPunishments[1], {
    defendantId: "defend2",
    punishmentId: "punishment2",
  });
});