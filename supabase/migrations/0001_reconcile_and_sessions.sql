-- Migration 0001 — Reconcile stale schema + add per-form settings & session tracking
--
-- This migration is IDEMPOTENT (safe to re-run). It does two things:
--   1. Documents/backfills columns that already exist in the live DB but were
--      missing from schema.sql (drift reconciliation). These are no-ops if present.
--   2. Adds the NEW columns/table for per-form settings and drop-off analytics.
--
-- Run in the Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────
-- 1. Drift reconciliation (already-live columns — IF NOT EXISTS = no-op)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE forms ADD COLUMN IF NOT EXISTS slug text UNIQUE;

ALTER TABLE fields ADD COLUMN IF NOT EXISTS options jsonb;
ALTER TABLE fields ADD COLUMN IF NOT EXISTS logic_rules jsonb;

-- Expand the field_type CHECK to include the types the app actually uses.
ALTER TABLE fields DROP CONSTRAINT IF EXISTS fields_field_type_check;
ALTER TABLE fields ADD CONSTRAINT fields_field_type_check
  CHECK (field_type IN ('text', 'number', 'email', 'textarea', 'phone', 'mcq', 'file'));

ALTER TABLE answers ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE answers ADD COLUMN IF NOT EXISTS sentiment text;

ALTER TABLE user_keys ADD COLUMN IF NOT EXISTS google_tts_key text;
ALTER TABLE user_keys ADD COLUMN IF NOT EXISTS gcp_project_id text;

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 2. NEW: per-form settings
-- ─────────────────────────────────────────────────────────────

ALTER TABLE forms ADD COLUMN IF NOT EXISTS redirect_url text;
-- default true preserves the current "always email on new response" behavior
ALTER TABLE forms ADD COLUMN IF NOT EXISTS email_notifications boolean DEFAULT true;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- ─────────────────────────────────────────────────────────────
-- 3. NEW: form_sessions — one row per form START (for drop-off analytics)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS form_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  response_id uuid REFERENCES responses(id) ON DELETE SET NULL,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,         -- null = abandoned / in-progress
  duration_ms integer,                           -- filled on completion
  last_field_index integer DEFAULT 0,            -- how far they got (drop-off point)
  total_fields integer,
  input_method text,
  device_type text,
  browser text,
  os text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS form_sessions_form_id_idx ON form_sessions(form_id);

ALTER TABLE form_sessions ENABLE ROW LEVEL SECURITY;

-- All session writes go through supabaseAdmin (service role, bypasses RLS),
-- so we only need a SELECT policy for form owners to read their own analytics.
DROP POLICY IF EXISTS "Form owners can view sessions" ON form_sessions;
CREATE POLICY "Form owners can view sessions" ON form_sessions FOR SELECT USING (
  EXISTS (SELECT 1 FROM forms WHERE forms.id = form_sessions.form_id AND forms.user_id = auth.uid())
);
