-- Supabase Schema for Voca (canonical current state)
-- For incremental changes on an existing DB, use supabase/migrations/ instead.

-- Set up tables
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  slug text UNIQUE,
  redirect_url text,                                    -- optional post-submit redirect
  email_notifications boolean DEFAULT true,             -- per-form new-response emails
  ai_context text,                                      -- background grounding the AI interviewer
  ai_tone text NOT NULL DEFAULT 'friendly' CHECK (ai_tone IN ('professional','friendly','playful')),
  welcome_message text,                                 -- creator-written opening line
  default_language text NOT NULL DEFAULT 'en' CHECK (default_language IN ('en','hi')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true
);

CREATE TABLE fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'email', 'textarea', 'phone', 'mcq', 'file')),
  required boolean DEFAULT false,
  order_index integer NOT NULL,
  options jsonb,          -- MCQ choices
  logic_rules jsonb       -- reserved for branching logic
);

CREATE TABLE responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  input_method text NOT NULL CHECK (input_method IN ('voice', 'text')),
  submitted_at timestamp with time zone DEFAULT now()
);

CREATE TABLE answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid REFERENCES responses(id) ON DELETE CASCADE NOT NULL,
  field_id uuid REFERENCES fields(id) ON DELETE CASCADE NOT NULL,
  value text,
  audio_url text,         -- public URL of the voice clip for this answer, if any
  sentiment text          -- positive | neutral | hesitant | frustrated
);

CREATE TABLE transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid REFERENCES responses(id) ON DELETE CASCADE NOT NULL,
  messages jsonb NOT NULL
);

-- One row per form START — powers drop-off / completion-time / device analytics.
CREATE TABLE form_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  response_id uuid REFERENCES responses(id) ON DELETE SET NULL,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,      -- null = abandoned / in-progress
  duration_ms integer,
  last_field_index integer DEFAULT 0,         -- drop-off point
  total_fields integer,
  input_method text,
  device_type text,
  browser text,
  os text,
  user_agent text
);
CREATE INDEX form_sessions_form_id_idx ON form_sessions(form_id);

CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Row Level Security (RLS)

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- waitlist: anyone may join (anonymous insert)
CREATE POLICY "Anyone can join waitlist" ON waitlist FOR INSERT WITH CHECK (true);

-- users policies
CREATE POLICY "Users can view their own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- forms policies
CREATE POLICY "Anyone can view active forms" ON forms FOR SELECT USING (is_active = true);
CREATE POLICY "Form owners can do everything" ON forms FOR ALL USING (auth.uid() = user_id);

-- fields policies
CREATE POLICY "Anyone can view fields of active forms" ON fields FOR SELECT USING (
  EXISTS (SELECT 1 FROM forms WHERE forms.id = fields.form_id AND forms.is_active = true)
);
CREATE POLICY "Form owners can manage fields" ON fields FOR ALL USING (
  EXISTS (SELECT 1 FROM forms WHERE forms.id = fields.form_id AND forms.user_id = auth.uid())
);

-- responses policies
CREATE POLICY "Anyone can insert a response" ON responses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM forms WHERE forms.id = responses.form_id AND forms.is_active = true)
);
CREATE POLICY "Form owners can view responses" ON responses FOR SELECT USING (
  EXISTS (SELECT 1 FROM forms WHERE forms.id = responses.form_id AND forms.user_id = auth.uid())
);
CREATE POLICY "Form owners can delete responses" ON responses FOR DELETE USING (
  EXISTS (SELECT 1 FROM forms WHERE forms.id = responses.form_id AND forms.user_id = auth.uid())
);

-- answers policies
CREATE POLICY "Anyone can insert answers" ON answers FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM responses
    JOIN forms ON forms.id = responses.form_id
    WHERE responses.id = answers.response_id AND forms.is_active = true
  )
);
CREATE POLICY "Form owners can view answers" ON answers FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM responses
    JOIN forms ON forms.id = responses.form_id
    WHERE responses.id = answers.response_id AND forms.user_id = auth.uid()
  )
);

-- transcripts policies
CREATE POLICY "Anyone can insert transcripts" ON transcripts FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM responses
    JOIN forms ON forms.id = responses.form_id
    WHERE responses.id = transcripts.response_id AND forms.is_active = true
  )
);
CREATE POLICY "Form owners can view transcripts" ON transcripts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM responses
    JOIN forms ON forms.id = responses.form_id
    WHERE responses.id = transcripts.response_id AND forms.user_id = auth.uid()
  )
);

-- form_sessions policies
-- Session writes happen via supabaseAdmin (service role), so only a read policy
-- for owners is needed here.
CREATE POLICY "Form owners can view sessions" ON form_sessions FOR SELECT USING (
  EXISTS (SELECT 1 FROM forms WHERE forms.id = form_sessions.form_id AND forms.user_id = auth.uid())
);

-- user_keys table
CREATE TABLE user_keys (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gemini_key text,
  groq_key text,
  google_tts_key text,
  gcp_project_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE user_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own keys" ON user_keys FOR ALL USING (auth.uid() = user_id);

-- Trigger for automatically creating a public.user record
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Storage buckets (create via Supabase dashboard or storage API):
--   audio_submissions — voice-answer clips uploaded by submit.ts
--   user_files        — file-upload field responses

-- ── Team roles (migration 0004) ─────────────────────────────
-- owner = forms.user_id · moderator = all but member-mgmt/delete · viewer = read-only

CREATE TABLE form_members (
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('moderator', 'viewer')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (form_id, user_id)
);
CREATE INDEX form_members_user_id_idx ON form_members(user_id);

CREATE TABLE form_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('moderator', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (form_id, email)
);

-- SECURITY DEFINER breaks forms ↔ form_members RLS recursion
CREATE OR REPLACE FUNCTION public.has_form_access(f_id uuid, min_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM forms WHERE id = f_id AND user_id = auth.uid())
  OR (min_role <> 'owner' AND EXISTS (
        SELECT 1 FROM form_members
        WHERE form_id = f_id AND user_id = auth.uid()
          AND (min_role = 'viewer' OR role = 'moderator')));
$$;

ALTER TABLE form_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see own membership, owners see all" ON form_members
  FOR SELECT USING (user_id = auth.uid() OR has_form_access(form_id, 'owner'));
CREATE POLICY "Owners manage members" ON form_members
  FOR ALL USING (has_form_access(form_id, 'owner'));
CREATE POLICY "Owners manage invites" ON form_invites
  FOR ALL USING (has_form_access(form_id, 'owner'));

CREATE POLICY "Members can view shared forms" ON forms
  FOR SELECT USING (has_form_access(id, 'viewer'));
CREATE POLICY "Moderators can update shared forms" ON forms
  FOR UPDATE USING (has_form_access(id, 'moderator'))
  WITH CHECK (has_form_access(id, 'moderator'));
CREATE POLICY "Members can view fields" ON fields
  FOR SELECT USING (has_form_access(form_id, 'viewer'));
CREATE POLICY "Moderators can manage fields" ON fields
  FOR ALL USING (has_form_access(form_id, 'moderator'));
CREATE POLICY "Members can view responses" ON responses
  FOR SELECT USING (has_form_access(form_id, 'viewer'));
CREATE POLICY "Moderators can delete responses" ON responses
  FOR DELETE USING (has_form_access(form_id, 'moderator'));
CREATE POLICY "Members can view answers" ON answers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM responses
            WHERE responses.id = answers.response_id
              AND has_form_access(responses.form_id, 'viewer')));
CREATE POLICY "Members can view transcripts" ON transcripts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM responses
            WHERE responses.id = transcripts.response_id
              AND has_form_access(responses.form_id, 'viewer')));
CREATE POLICY "Members can view sessions" ON form_sessions
  FOR SELECT USING (has_form_access(form_id, 'viewer'));
