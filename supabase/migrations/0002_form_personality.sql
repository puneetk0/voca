-- Migration 0002 — Per-form AI personality & conversation settings
--
-- IDEMPOTENT (safe to re-run). Adds the columns that let a form creator shape
-- how the AI interviewer sounds and what it knows:
--   ai_context       — background ("who's asking and why"); grounds the AI so it
--                      can answer respondent questions and make transitions specific
--   ai_tone          — personality preset: professional | friendly | playful
--   welcome_message  — creator-written opening line the AI speaks first
--   default_language — session starting language (en | hi). NOTE: defaults NEW
--                      AND EXISTING forms to English; creators can switch per form.
--
-- Run in the Supabase SQL editor.

ALTER TABLE forms ADD COLUMN IF NOT EXISTS ai_context text;

ALTER TABLE forms ADD COLUMN IF NOT EXISTS ai_tone text NOT NULL DEFAULT 'friendly';
ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_ai_tone_check;
ALTER TABLE forms ADD CONSTRAINT forms_ai_tone_check
  CHECK (ai_tone IN ('professional', 'friendly', 'playful'));

ALTER TABLE forms ADD COLUMN IF NOT EXISTS welcome_message text;

ALTER TABLE forms ADD COLUMN IF NOT EXISTS default_language text NOT NULL DEFAULT 'en';
ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_default_language_check;
ALTER TABLE forms ADD CONSTRAINT forms_default_language_check
  CHECK (default_language IN ('en', 'hi'));
