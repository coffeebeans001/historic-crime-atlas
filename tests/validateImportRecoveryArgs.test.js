import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  validateImportRecoveryArgs,
} from "../src/import/validateImportRecoveryArgs.js";

test("allows normal import arguments without recovery", () => {
  assert.equal(
    validateImportRecoveryArgs({
      insertTrials: false,
      resumeImport: false,
    }),
    true
  );

  assert.equal(
    validateImportRecoveryArgs({
      insertTrials: true,
      resumeImport: false,
    }),
    true
  );
});

test("rejects recovery without insert-trials", () => {
  assert.throws(
    () =>
      validateImportRecoveryArgs({
        insertTrials: false,
        resumeImport: true,
      }),
    /--resume requires --insert-trials/
  );
});

test("rejects recovery while the feature is disabled", () => {
  assert.throws(
    () =>
      validateImportRecoveryArgs({
        insertTrials: true,
        resumeImport: true,
      }),
    /Import recovery is not enabled yet/
  );
});

test("main importer invokes recovery argument validation", async () => {
  const importerSource = await readFile(
    new URL("../scripts/fetchOldBaileyApi.js", import.meta.url),
    "utf8"
  );

  assert.match(
    importerSource,
    /import\s*\{\s*validateImportRecoveryArgs\s*\}\s*from\s*["']\.\.\/src\/import\/validateImportRecoveryArgs\.js["']/
  );

  assert.match(
    importerSource,
    /validateImportRecoveryArgs\s*\(\s*\{\s*insertTrials\s*,\s*resumeImport\s*,?\s*\}\s*\)/
  );
});