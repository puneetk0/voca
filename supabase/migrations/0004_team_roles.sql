-- ============================================================
-- 0004: Team roles — per-form members (moderator/viewer) + invites
-- Run this in the Supabase SQL editor.
--
-- Model:
--   owner     = forms.user_id (implicit, unchanged)
--   moderator = everything except member management + form delete
--   viewer    = read-only (dashboard, results, insights, export)
-- All new RLS policies are ADDITIVE — existing owner-only policies
-- stay untouched; permissive policies OR together.
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS form_members (
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('moderator', 'viewer')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (form_id, user_id)
);
CREATE INDEX IF NOT EXISTS form_members_user_id_idx ON form_members(user_id);

CREATE TABLE IF NOT EXISTS form_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,                 -- stored lowercased
  role text NOT NULL CHECK (role IN ('moderator', 'viewer')),
  token_hash text NOT NULL UNIQUE,     -- sha256 of the raw token; raw only in the email link
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (form_id, email)
);

-- ── Access helper ───────────────────────────────────────────
-- SECURITY DEFINER bypasses RLS inside the function, which breaks the
-- forms ↔ form_members policy recursion. STABLE lets the planner cache
-- it per-row-set. search_path pinned per Supabase lint guidance.

CREATE OR REPLACE FUNCTION public.has_form_access(f_id uuid, min_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM forms WHERE id = f_id AND user_id = auth.uid()
  )
  OR (
    min_role <> 'owner' AND EXISTS (
      SELECT 1 FROM form_members
      WHERE form_id = f_id
        AND user_id = auth.uid()
        AND (min_role = 'viewer' OR role = 'moderator')
    )
  );
$$;

-- ── RLS: new tables ─────────────────────────────────────────

ALTER TABLE form_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_invites ENABLE ROW LEVEL SECURITY;

-- Members can see their own membership row; owners see all rows of their forms.
CREATE POLICY "Members see own membership, owners see all" ON form_members
  FOR SELECT USING (user_id = auth.uid() OR has_form_access(form_id, 'owner'));
-- Only owners manage membership (writes also go through the service role).
CREATE POLICY "Owners manage members" ON form_members
  FOR ALL USING (has_form_access(form_id, 'owner'));

-- Invites are owner-only; token acceptance runs through the service role.
CREATE POLICY "Owners manage invites" ON form_invites
  FOR ALL USING (has_form_access(form_id, 'owner'));

-- ── RLS: additive member policies on existing tables ────────

-- forms: members can see shared forms (even paused ones); moderators can edit.
CREATE POLICY "Members can view shared forms" ON forms
  FOR SELECT USING (has_form_access(id, 'viewer'));
CREATE POLICY "Moderators can update shared forms" ON forms
  FOR UPDATE USING (has_form_access(id, 'moderator'))
  WITH CHECK (has_form_access(id, 'moderator'));
-- (DELETE stays owner-only via the existing "Form owners can do everything")

-- fields
CREATE POLICY "Members can view fields" ON fields
  FOR SELECT USING (has_form_access(form_id, 'viewer'));
CREATE POLICY "Moderators can manage fields" ON fields
  FOR ALL USING (has_form_access(form_id, 'moderator'));

-- responses
CREATE POLICY "Members can view responses" ON responses
  FOR SELECT USING (has_form_access(form_id, 'viewer'));
CREATE POLICY "Moderators can delete responses" ON responses
  FOR DELETE USING (has_form_access(form_id, 'moderator'));

-- answers
CREATE POLICY "Members can view answers" ON answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM responses
      WHERE responses.id = answers.response_id
        AND has_form_access(responses.form_id, 'viewer')
    )
  );

-- transcripts
CREATE POLICY "Members can view transcripts" ON transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM responses
      WHERE responses.id = transcripts.response_id
        AND has_form_access(responses.form_id, 'viewer')
    )
  );

-- form_sessions
CREATE POLICY "Members can view sessions" ON form_sessions
  FOR SELECT USING (has_form_access(form_id, 'viewer'));
