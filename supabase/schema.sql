-- Supabase Schema for Voca

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
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true
);

CREATE TABLE fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'email', 'textarea')),
  required boolean DEFAULT false,
  order_index integer NOT NULL
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
  value text
);

CREATE TABLE transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid REFERENCES responses(id) ON DELETE CASCADE NOT NULL,
  messages jsonb NOT NULL
);

-- Row Level Security (RLS)

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

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

-- user_keys table
CREATE TABLE user_keys (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gemini_key text,
  groq_key text,
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

