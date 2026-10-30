-- Historic Crime Atlas - V1.7
-- Milestone 3.4: Historical-date support for trial_summary
-- Target database: historic_crime_atlas_restore_test
--
-- Purpose:
-- Preserve the original 16 view columns and their order.
-- Append historical_trial_date and historical_calendar.
-- Preserve all existing LEFT JOIN relationships.
--
-- Baseline:
-- Total rows: 275
-- Unique trials: 275
-- Duplicate rows: 0
--
-- TEST DATABASE ONLY.
-- Do not execute against the live database.

CREATE OR REPLACE VIEW historic_crime_atlas_restore_test.trial_summary AS
SELECT
    t.id AS trial_id,
    d.defendant_id AS defendant_id,
    COALESCE(d.defendant_name, t.defendant_name) AS defendant_name,
    d.gender AS gender,
    d.party_type AS party_type,
    o.offence_id AS offence_id,
    o.offence_name AS offence_name,
    o.category AS offence_category,
    o.offence_group AS offence_group,
    o.subcategory AS subcategory,
    j.judge_id AS judge_id,
    COALESCE(j.judge_name, t.judge_name) AS judge_name,
    t.trial_date AS trial_date,
    t.verdict AS verdict,
    t.trial_location AS trial_location,
    t.sentence_outcome AS sentence_outcome,
    t.historical_trial_date AS historical_trial_date,
    t.historical_calendar AS historical_calendar
FROM historic_crime_atlas_restore_test.trials AS t
LEFT JOIN historic_crime_atlas_restore_test.defendants AS d
    ON d.defendant_id = t.defendant_id
LEFT JOIN historic_crime_atlas_restore_test.offences AS o
    ON o.offence_id = t.offence_id
LEFT JOIN historic_crime_atlas_restore_test.judges AS j
    ON j.judge_id = t.judge_id;