# Historic Crime Atlas — V1.7 Recovery Readiness Record

**Project:** Historic Crime Atlas / Old Bailey Research Atlas  
**Branch:** `version-1.7`  
**Milestone:** 2.4E — Recovery Audit and Readiness Testing  
**Review date:** 25 October 2026  
**Latest verified commit:** `646616e`  
**Recovery activation status:** DISABLED

---

## 1. Purpose and Scope

This document records the findings of the V1.7 Milestone 2.4E recovery audit.

The audit examined the import recovery mechanism, checkpoint validation, source-case ID safeguards, transaction handling, duplicate protection, and automated testing.

The objective was to evaluate the existing recovery implementation and identify remaining requirements before recovery functionality could be enabled.

**The audit does not authorise live recovery operations or changes to the research database.**

## 2. Verified Safeguards

### 2.1 Checkpoint Integrity

The checkpoint implementation includes validation of:

- Checkpoint structure and lifecycle.
- Batch source-case ID uniqueness.
- Processed trial statuses.
- Trial membership within the original batch.
- Existing trial-result updates without duplicate checkpoint entries.

These behaviours were reviewed and supported by automated tests.

### 2.2 Source-Case ID Validation

The importer validates source-case identifiers before insertion.

The validation rejects:

- Missing identifiers.
- Blank or whitespace-only identifiers.
- Non-string identifiers.
- Identifiers exceeding 100 characters.

The 100-character safeguard corresponds to the current MySQL `trials.source_case_id` column definition, `VARCHAR(100)`.

A regression test was added to confirm rejection of a 101-character identifier.

### 2.3 Duplicate Protection

The existing importer checks whether a source-case identifier already exists before inserting a trial.

The database also contains a unique index named `uq_trials_source_case_id`.

These mechanisms help prevent duplicate insertions for non-NULL source-case identifiers.

### 2.4 Transaction Handling

Code inspection confirmed that the trial importer uses database transactions.

The implementation includes transaction commit and rollback paths.

This review does not establish that every database failure scenario has been tested end to end.

### 2.5 Checkpoint Persistence

The importer processes trials sequentially and awaits the checkpoint-save callback after each recorded trial result.

Checkpoint persistence failures are intended to interrupt subsequent processing.

A remaining risk exists if a database transaction commits successfully but the corresponding checkpoint update is not persisted.

### 2.6 Recovery Selection

The recovery selection implementation checks checkpoint eligibility and batch consistency.

Records previously classified as `INSERTED` or `DATABASE_DUPLICATE` are excluded from retry selection.

Recovery activation remains blocked by the argument validator.

## 3. Automated Testing

Following the audit improvements, the project test command was updated to:

```bash
npm test
```

The command now invokes the complete Node.js test suite using `node --test`.

**Latest verified result:**

- Total tests: 115
- Passed: 115
- Failed: 0

The tests include regression coverage for oversized source-case identifiers.

Passing automated tests provide evidence for the behaviours tested. They do not establish complete production recovery readiness.

## 4. Outstanding Risks

### 4.1 Nullable Source-Case ID Column

The MySQL `trials.source_case_id` column currently permits NULL values.

Although application-level validation rejects missing identifiers in the audited import path, the database constraint does not independently enforce that requirement.

Any future schema change must first assess existing data and database dependencies.

### 4.2 Commit and Checkpoint Persistence Gap

A database transaction may commit successfully before the corresponding checkpoint result is saved.

The existing duplicate lookup and unique index help mitigate repeated insertion, but the complete interruption-and-recovery scenario requires controlled integration testing.

### 4.3 End-to-End Recovery Validation

The complete recovery process has not yet been demonstrated in an isolated database environment.

Further testing should cover interrupted imports, duplicate detection, checkpoint persistence failures, and safe continuation after interruption.

The existing research database must not be used for uncontrolled recovery experiments.

## 5. Recovery Activation Decision

**Decision: Recovery activation is deferred.**

The `--resume` option must remain disabled.

The existing recovery argument validator rejects attempts to enable recovery, including attempts combined with `--insert-trials`.

No live recovery operation was authorised during this audit.

Completion of the code-review and safeguards work must not be interpreted as approval to enable recovery.

## 6. Git Checkpoint

The audit improvements were committed and pushed to the `version-1.7` branch.

**Commit:** `646616e`  
**Commit message:** `test: validate source case ID length and run full test suite`

Changes included:

1. Updating `npm test` to execute the complete automated suite.
2. Adding source-case ID length validation before insertion.
3. Adding regression coverage for oversized identifiers.

The working tree was confirmed clean after the GitHub push.

## 7. Requirements Before Recovery Activation

Before considering removal of the recovery safety lock:

1. Review database-level source-case ID constraints and existing records.
2. Establish an isolated recovery integration-test environment.
3. Test interruption between database commit and checkpoint persistence.
4. Verify duplicate prevention during recovery.
5. Verify checkpoint integrity after simulated failures.
6. Confirm that recovery selection processes only eligible trials.
7. Review test results and document any remaining risks.
8. Obtain an explicit decision to authorise recovery activation.

Until these conditions have been assessed, recovery must remain disabled.

## 8. Milestone Outcome

**Milestone 2.4E — Code-review and safeguards scope: Complete.**

The audit established a documented understanding of the current import recovery implementation, strengthened source-case ID validation, and expanded the project's automated test coverage.

**Live recovery readiness: Not yet established.**

Recovery activation and controlled integration testing remain future work.

---

*Historic Crime Atlas — V1.7 Recovery Readiness Record*  
*Prepared following Milestone 2.4E audit and safeguards verification.*