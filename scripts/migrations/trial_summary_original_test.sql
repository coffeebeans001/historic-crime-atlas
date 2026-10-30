-- Historic Crime Atlas - V1.7
-- Original trial_summary view definition
-- Source database: historic_crime_atlas_restore_test
-- Backup captured before historical-date view enhancement.
-- Test database only. Do not execute against the live database.
-- REFERENCE COPY ONLY - NOT AN EXECUTABLE ROLLBACK SCRIPT.
-- CREATE VIEW will fail if trial_summary already exists.
-- Original definition has not been independently tested for restoration.
-- Do not execute this file without preparing and validating a rollback procedure.

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW historic_crime_atlas_restore_test.trial_summary AS select t.id AS trial_id,d.defendant_id AS defendant_id,coalesce(d.defendant_name,t.defendant_name) AS defendant_name,d.gender AS gender,d.party_type AS party_type,o.offence_id AS offence_id,o.offence_name AS offence_name,o.category AS offence_category,o.offence_group AS offence_group,o.subcategory AS subcategory,j.judge_id AS judge_id,coalesce(j.judge_name,t.judge_name) AS judge_name,t.trial_date AS trial_date,t.verdict AS verdict,t.trial_location AS trial_location,t.sentence_outcome AS sentence_outcome from (((historic_crime_atlas_restore_test.trials t left join historic_crime_atlas_restore_test.defendants d on((d.defendant_id = t.defendant_id))) left join historic_crime_atlas_restore_test.offences o on((o.offence_id = t.offence_id))) left join historic_crime_atlas_restore_test.judges j on((j.judge_id = t.judge_id)));