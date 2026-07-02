-- Migration 0003 — Storage buckets, waitlist policy, realtime publication
--
-- IDEMPOTENT (safe to re-run). Closes the "works locally, fails silently in
-- prod" gaps: the app assumes public storage buckets exist, that anonymous
-- respondents can insert into waitlist, and that the dashboard's realtime
-- subscription receives INSERTs.
--
-- Run in the Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────
-- 1. Storage buckets (public) — voice clips + file-upload answers
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('audio_submissions', 'audio_submissions', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('user_files', 'user_files', true)
on conflict (id) do update set public = true;

-- Public read + anonymous upload for both buckets (respondents are anonymous).
drop policy if exists "Public read voca buckets" on storage.objects;
create policy "Public read voca buckets" on storage.objects
  for select using (bucket_id in ('audio_submissions', 'user_files'));

drop policy if exists "Anon upload voca buckets" on storage.objects;
create policy "Anon upload voca buckets" on storage.objects
  for insert with check (bucket_id in ('audio_submissions', 'user_files'));

-- ─────────────────────────────────────────────────────────────
-- 2. Waitlist: allow anonymous inserts (defensive — the action uses the
--    service role today, but this makes the anon path safe too)
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Anyone can join waitlist" on waitlist;
create policy "Anyone can join waitlist" on waitlist
  for insert with check (true);

-- ─────────────────────────────────────────────────────────────
-- 3. Realtime: the admin dashboard subscribes to responses inserts.
--    Add responses + form_sessions to the supabase_realtime publication
--    (guarded so re-running doesn't error).
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'responses'
  ) then
    alter publication supabase_realtime add table public.responses;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'form_sessions'
  ) then
    alter publication supabase_realtime add table public.form_sessions;
  end if;
end $$;
