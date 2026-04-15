<div align="center">
  <br />
  <img src="https://lucide.dev/icons/mic.svg" alt="Voca Logo" width="80" height="80" />
  <h1 align="center">Voca</h1>
  <p align="center">
    <strong>Forms are dead. Breathe life into data collection with AI-driven voice interviews.</strong>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/Next.js-14-black" alt="Next.js" />
    <img src="https://img.shields.io/badge/Supabase-Database%20%7C%20Auth%20%7C%20Realtime-3ECF8E" alt="Supabase" />
    <img src="https://img.shields.io/badge/Google%20Cloud-TTS%20%7C%20Chirp%202.0-4285F4" alt="Google Cloud" />
    <img src="https://img.shields.io/badge/Gemini-2.5%20Flash-8E75B2" alt="Gemini" />
    <img src="https://img.shields.io/badge/Zustand-State-black?" alt="Zustand" />
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
  </p>
</div>

---

## 🛑 The Problem

Traditional data collection (Typeform, Google Forms) is rigid and friction-heavy. Users are confronted with dull, static HTML elements that require high manual effort, especially on mobile devices. For form creators, there is no native, accessible way to collect data safely from users who prefer spoken interaction, or to capture the tonal nuance of *how* an answer was spoken. 

## 💡 Our Solution

**Voca** is a voice-first conversational AI form builder. Instead of reading questions and typing answers, the user is interviewed by an intelligent agent. Voca parses natural speech (including code-switching like Hinglish), responds audibly with low-latency human-like pacing, strictly extracts the required schema data, and perfectly formats it into a Postgres database. 

It handles data integrity out of the box—rejecting invalid unstructured emails, gracefully falling back STT engines upon failure, and live-syncing the resulting data to a beautiful Real-time Dashboard for the event organizer.

---

## 🛠 Technology Stack: What, How, and Why

### Frontend
- **What:** React / Next.js 14 App Router
- **How:** Server-Side Rendering (SSR) for admin routing, combined with heavily optimized Client Components managing the conversational state (Framer Motion, `useVoiceRecorder.ts`).
- **Why:** Next.js Server Actions drastically simplify the boundaries between client-side Audio blob recording and server-side bucket uploading without requiring messy REST boilerplate.

### Backend & Database
- **What:** Supabase (Postgres, Auth, Storage, WebSockets)
- **How:** Stores forms, fields, and parsed answers relationally. Supabase `channels` listen to PostgreSQL row-level inserts and push them aggressively to the admin table UI.
- **Why:** Supabase eliminates the need to build a custom WebSocket infrastructure and offers tightly integrated RLS (Row Level Security) and S3-compatible Blob storage for the audio natively.

### AI Conversational Engine
- **What:** Google Gemini 2.5 Flash
- **How:** Ingests dynamic prompt context (e.g. "Strictly enforce RFC 5322 parsing") alongside dialogue history and returns a strictly typed JSON schema containing both the extracted field value and the next conversational response. 
- **Why:** Gemini Flash offers incredible latency-to-context ratios, perfect for parsing colloquial dialogue in milliseconds to keep the interview flow natural.

### Voice Engine (STT & TTS)
- **What:** Google Cloud STT V1 (Chirp 2) / TTS + Groq Whisper
- **How:** Transcribes raw browser WebM data to string using Google STT (with Hinglish alternative codes). Groq's Whisper model acts as an instant fallback mechanism. The TTS engine converts the AI response into natural speech using SSML payload tags (`<break time="200ms"/>`).
- **Why:** Browser-native speech engines sound robotic and lack accent recognition. Combining Google's enterprise speech API with an immediate Groq fallback ensures zero-downtime, flawlessly accented form experiences.

---

## 🏗 Complete System Architecture

```text
voca/
├── src/
│   ├── app/
│   │   ├── admin/               # Admin Dashboard (Auth Protected)
│   │   │   ├── forms/[id]/      # Live WebSockets Dashboard (ResponsesTable)
│   │   │   └── settings/        # BYOK Setup (Google Cloud & Groq API Keys)
│   │   ├── api/                 # Stateless Next.js API Routes for AI/Voice
│   │   │   ├── converse/        # Gemini Engine — JSON extraction via prompts
│   │   │   ├── transcribe/      # STT Engine (Chirp 2.0 -> Whisper Fallback)
│   │   │   └── tts/             # TTS Engine (SSML string to base64 audio block)
│   │   └── f/[id]/              # Responder Form Route
│   │       └── _components/     
│   │           └── FormSession.tsx # The CORE React Client State Engine
│   ├── components/
│   │   ├── admin/
│   │   │   └── ResponsesTable.tsx  # Uses supabase.channel for Real-time DB sync
│   │   ├── chat/                
│   │   └── voice/               # Realtime audio Waveform Visualizer UI
│   └── lib/
│       ├── actions/             # Secure Server Actions
│       │   └── submit.ts        # FormData processor to bypass Base64 memory bloating
│       ├── hooks/               
│       │   └── useVoiceRecorder.ts # MediaRecorder browser wrapper handling blob capture
│       └── store/
│           └── conversation.ts  # Zustand store saving answers & persisting to localStorage
```

### Critical Component Breakdown

#### `src/app/f/[id]/_components/FormSession.tsx`
The powerhouse of the application. It orchestrates the fluid transition between `voice` and `text` modes, initializes `getUserMedia` to capture chunks as Blobs, and houses the heavy optimistic UI logic. When an audio segment finishes, it plays an instant local TTS filler phrase ("Hmm...", "Let me see...") while simultaneously querying the `/api/converse` endpoint to mask completely the network latency.

#### `src/app/api/converse/route.ts`
The brain of the operation. This route dynamically builds its system prompt based on the current field type (e.g., throwing a rigid rejection loop if a user provides an invalid email). It forces Gemini to behave as an interviewer, returning `{"extractedValue": "puneet@test.com", "aiMessage": "Got it. And your number?"}`.

#### `src/lib/actions/submit.ts`
Voca transports heavy media (the user's source voice files) across the Next.js Client-Server boundary via standard `FormData`. This file natively unpacks the Blobs, fires them directly into Supabase Storage, and maps the resulting public URLs right back to the row answers in a single clean PostgreSQL transaction.

---

## ⚡️ Core Features & Workflows

**1. Latency Masking & Humanization**
When using Voice Input, a major hurdle with LLMs is the awkward silence while generating responses. Voca solves this by tracking the exact moment `MediaRecorder` halts, immediately playing a generic filler word locally (bypassing the server) while asynchronously firing the audio to the STT route and the transcript to Gemini.

**2. Strict Data Integrity Loop**
User dictates: "Um, my email is john doe at gmail... oh wait, yahoo."
`src/api/converse` captures this, strips spaces, forces lowercase, identifies the phonetic intent, extracts `johndoe@yahoo.com`, and cleanly deposits it into the Postgres answer row, effectively replacing complex RegEx with intelligent entity extraction.

**3. The Real-Time Admin Sync**
- Client records blob -> stored in Zustand.
- User submits -> `FormData` payload sent to `submit.ts`.
- `submit.ts` -> uploads blob to `audio_submissions` Bucket.
- Inserts `response` and `answer` (containing the bucket URL) to DB.
- `ResponsesTable` picks up the PostgreSQL INSERT via websocket and instantly renders the newly extracted row on the Admin's screen featuring the `<MinimalAudioPlayer>` to play back the conversation natively.

---

## 💻 Local Setup & Installation

**Prerequisites:**
- Node.js 18.17+
- npm or pnpm
- A Supabase Project (Free Tier works)
- Google Cloud Project (for TTS/STT)
- Gemini API Key

**1. Clone the repository**
```bash
git clone https://github.com/puneetk0/voca.git
cd voca
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure Environment Variables**  
Create a `.env.local` file at the root. You will explicitly configure your AI limits here, but the specific Google/Groq keys are bound to individual users inside the `settings` dashboard (BYOK model).

| Variable | Description | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Database Endpoint | Supabase Project Settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Database key (Safe for browser) | Supabase Project Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin root key to bypass RLS for server actions | Supabase Project Settings |
| `UPSTASH_REDIS_REST_URL` | Redis boundary limits | Upstash Console |
| `UPSTASH_REDIS_REST_TOKEN` | Redis boundary token for API rate-limiting | Upstash Console |

**4. Run Database Migrations**
Run the SQL queries stored in `supabase/migrations/` in your Supabase SQL editor to create the `forms`, `fields`, `responses`, `answers`, and `user_keys` tables.

**5. Start the Application**
```bash
npm run dev
```
Navigate to `http://localhost:3000`. Create an account, head to Settings, inject your Google TTS/STT API keys and Groq API keys down at the user-level, and run your first form!

---

## 🚧 Known Challenges & Future Roadmap

**Challenge Faced: Safely Sending Media Across Server Action Boundaries**  
Initially, we struggled to send audio blobs to the server action, resorting to dense Base64 JSON encoding, which blocked the main thread and caused browser lag.  
*Mitigation:* Rebuilt the submission pipeline to utilize native Next.js `FormData` processing, natively piping the binary objects to arrayBuffers on the server.

**Future Roadmap:**
- **Inertia Polling Resumption:** Gracefully resume abandoned forms utilizing local persistent `Zustand` memory schemas if a user accidentally closes a tab.
- **Multilingual Prompts:** Explicit UI options allowing the Form Creator to strictly configure the STT fallback engine language arrays (e.g., Arabic, Mandarin) instead of hardcoding `en-IN` / `hi-IN`.
- **Advanced Field Logic:** Dynamic branch logic parsing (e.g., If the extracted value of field 2 is "No", dynamically manipulate `fields` array and instantly skip Field 3 within the Zustand store).
