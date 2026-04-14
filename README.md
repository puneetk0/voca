# Voca: The Voice-First Form Builder

Voca is a sophisticated, highly conversational AI-driven form generator and responder built with Next.js 14 (App Router). Instead of filling out rigid text fields, Voca allows users to literally speak with an AI to populate strict JSON data schemas dynamically.

## Core Features & Architecture

### 1. The Stack
- **Framework**: Next.js 14, TailwindCSS
- **Database**: Supabase (PostgreSQL), utilizing strictly isolated Row Level Security.
- **State Management**: `zustand` (Manages fluid Voice/Text multimodal inputs in a single-page view).
- **Core LLM Processing**: `@google/generative-ai` routing to **Gemini 2.5 Flash**.
- **Speech-to-Text**: Groq Whisper API (for instant, low-latency audio processing).
- **Text-to-Speech**: Browser Native Web Speech API (ensuring lightweight front-end fallbacks).
- **Rate Limiting**: Upstash Redis (graceful sliding window rate limiting).

### 2. Security First (Bring Your Own Key)
Voca is built on a "Bring Your Own Key" (BYOK) paradigm to keep the service free. 
- Form creators authenticate via Magic Link and input their own `Google Gemini` and `Groq` API credentials to power their forms.
- These keys are encrypted in the Supabase `user_keys` table strictly guarded by Postgres RLS, and only executed server-side via the `service_role` key when responder submissions are parsed.

### 3. Evading Serverless Timeouts
Because LLM chaining and transcription takes > 10 seconds, Voca flawlessly navigates Vercel's Serverless Timeout constraints by strictly splitting the operations visually in the browser:
1. Client browser records Audio using an iOS-safari compatible MP4 fallback constraint. 
2. Voice blob uploads to `/api/transcribe` via Groq.
3. Transcribed text is parsed and sent dynamically to `/api/converse` to interface with the Gemini logic. 

## Folder Structure

```
├── supabase/
│   └── schema.sql              # The core atomic DB architecture and RLS policies
├── src/
│   ├── app/
│   │   ├── api/                # Core AI logic (converse, create-form, transcribe)
│   │   ├── admin/              # Admin dashboard, Link generation, Settings
│   │   ├── f/[id]/             # The Responder conversational UI client
│   │   ├── login/              # Magic Link authentication 
│   │   └── onboarding/         # BYOK setup wizard
│   ├── lib/
│   │   ├── actions/            # Secure Server Actions mapping DB operations 
│   │   ├── hooks/              # Custom useVoiceRecorder abstraction
│   │   └── store/              # Zustand conversation store
│   └── components/
│       ├── admin/              
│       └── ui/
```

## Setup & Deployment Guide

1. **Locally:**
   - Clone the repo.
   - Run `npm install`
   - Grab the schema located in `supabase/schema.sql` and run it in your remote Supabase Project SQL Editor.
   - Duplicate `.env.example` into `.env.local` and substitute your actual Supabase URL and Keys.
   - Run `npm run dev`.

2. **Deploying to Vercel:**
   - Standard Next.js deployment. Ensure you configure your environmental variables in the Vercel Dashboard mapping to your Supabase and optionally your Upstash Redis URLs!
