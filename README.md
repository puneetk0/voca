<div align="center">
  <h1>Voca</h1>
  <p><strong>It's not a form. It's a conversation.</strong></p>
  <p>A voice-first form builder. An AI interviews your respondents by voice — in English or Hinglish — and turns messy, spoken answers into clean, structured data.</p>
</div>

---

## What it does

- **Describe a form in plain language** → AI drafts the questions and a matching conversation personality.
- **Share one link** → respondents answer by **voice or text**, on any phone or laptop. No app, no login.
- **A warm AI voice interviews them** one question at a time: understands corrections mid-sentence, handles Hinglish code-switching, confirms what it heard, and extracts structured values.
- **Real-time dashboard** with per-field breakdowns, drop-off funnel, completion time, device/browser split, answer sentiment, audio playback, and CSV export.
- Per-form **AI personality** (context, tone, welcome message, language), **post-submit redirect**, **email notifications**, **admin preview mode**, and a **health check**.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router) · React 19 · TypeScript · Tailwind v4 |
| Data / auth / storage / realtime | **Supabase** (Postgres + RLS, email/password auth, Storage, Realtime) |
| LLM (conversation + form generation) | **Groq** `llama-3.3-70b` → **Cerebras** `gpt-oss-120b` fallback |
| Speech-to-text | **Groq Whisper** → **Sarvam Saarika** fallback (Hinglish-native) |
| Text-to-speech | **Sarvam** → browser speech → captions mode |
| Rate limiting | Upstash Redis · Email: Resend · Analytics: PostHog |

There is **no Google Cloud dependency.** At least one of `GROQ_KEY` / `CEREBRAS_API_KEY` is required; everything else is optional and degrades gracefully.

## Local setup

```bash
git clone https://github.com/puneetk0/voca.git
cd voca
npm install          # Node.js >= 20.9
cp .env.example .env.local   # then fill in the values
npm run dev
```

**1. Environment** — see [`.env.example`](.env.example). Minimum to run: Supabase URL/keys + one LLM key (`GROQ_KEY` or `CEREBRAS_API_KEY`). Add `SARVAM_API_KEY` for real voice.

**2. Database** — in the Supabase SQL editor, run the migrations **in order**:

```
supabase/migrations/0001_reconcile_and_sessions.sql
supabase/migrations/0002_form_personality.sql
supabase/migrations/0003_storage_waitlist_realtime.sql
```

They are idempotent. `0003` also creates the public storage buckets (`audio_submissions`, `user_files`), the waitlist insert policy, and enables realtime on `responses`. (For a brand-new project you can instead run [`supabase/schema.sql`](supabase/schema.sql), then `0003`.)

**3. Run** — open `http://localhost:3000`, sign up, and create your first form. Use the **Preview** button on the form dashboard to test it without saving responses.

## Production deploy (checklist)

Most of these fail **silently** if skipped:

- [ ] Run migrations `0001` → `0002` → `0003` on the production database.
- [ ] Confirm buckets `audio_submissions` + `user_files` exist and are **public** (0003 creates them).
- [ ] Set env vars on the host (Vercel): `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_KEY` (+ `GROQ_KEY_2/3`), `CEREBRAS_API_KEY`, `SARVAM_API_KEY`, `NEXT_PUBLIC_APP_URL`, `ALLOWED_ADMIN_EMAILS`, `UPSTASH_REDIS_REST_URL/TOKEN` (enables rate limiting), `NEXT_PUBLIC_POSTHOG_KEY/HOST`, `RESEND_API_KEY` + `EMAIL_FROM`.
- [ ] For email: verify your domain in Resend and set `EMAIL_FROM` (or leave the `onboarding@resend.dev` default for testing).
- [ ] `ALLOWED_ADMIN_EMAILS` **must** be set in production — an empty value denies all admin access by design.

The server logs a warning at startup for any of these that are missing in production (see `src/instrumentation.ts`).

## Project structure

```
src/
├── app/
│   ├── page.tsx                     # landing
│   ├── f/[slug]/                    # responder (FormSession = the voice engine)
│   ├── admin/                       # dashboard, create, forms/[id] (+ /edit), settings
│   ├── api/{converse,transcribe,tts,create-form}/   # AI + voice routes
│   └── auth/{callback,signout}/
├── lib/
│   ├── llm.ts                       # Groq → Cerebras chain
│   ├── api-errors.ts                # typed error codes + UI mapping
│   ├── hooks/{useTTS,useVoiceRecorder}.ts
│   └── actions/                     # server actions (forms, submit, sessions, health, …)
└── components/{admin,landing,form,voice}/
supabase/{schema.sql, migrations/}
```

## License

MIT
