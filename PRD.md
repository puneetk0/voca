# Product Requirements Document
## Voice-First Conversational Form Builder
**Name** Voca | Voice Form Builder
**Version:** 1.0 — V1 Scope  
**Author:** Puneet (Founder) + Claude (Co-thinker)  
**Status:** Ready for Development  
**Last Updated:** April 2026

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The Insight](#2-the-insight)
3. [The Solution](#3-the-solution)
4. [Target Audience](#4-target-audience)
5. [Competitive Landscape](#5-competitive-landscape)
6. [Product Philosophy](#6-product-philosophy)
7. [V1 Feature Scope](#7-v1-feature-scope)
8. [User Flows](#8-user-flows)
9. [Technical Architecture](#9-technical-architecture)
10. [Data Models](#10-data-models)
11. [API Design](#11-api-design)
12. [Edge Cases & Handling](#12-edge-cases--handling)
13. [Design Language](#13-design-language)
14. [Open Source Strategy](#14-open-source-strategy)
15. [Distribution Plan](#15-distribution-plan)
16. [V1 Build Timeline](#16-v1-build-timeline)
17. [Success Metrics](#17-success-metrics)
18. [What V1 Deliberately Ignores](#18-what-v1-deliberately-ignores)
19. [Future Roadmap](#19-future-roadmap)

---

## 1. The Problem

Forms are broken. Not technically — they work fine. They're broken *experientially*.

Google Forms was built as a utility, not a product. It treats data collection like a spreadsheet operation — cold, rigid, transactional. The person filling it out feels like they're filing a tax return. The result is predictable: people abandon forms, give minimal answers, and feel nothing.

The alternatives exist but they've chosen profit over people:
- **Typeform** cracked conversational UI but locked it behind aggressive pricing
- **Tally, Fillout, Formshare** are better but still fundamentally text interfaces with conversational paint on top
- **Nobody** has questioned whether typing should be the primary input at all

The three core failures of every existing form tool:

**Failure 1 — Typing is friction.** Speaking is 3x faster than typing. Yet every form tool, including the "conversational" ones, requires you to type. In a world where people talk to Siri, Alexa, and Google Assistant daily, making someone type into a form is a regressive UX decision.

**Failure 2 — Forms don't listen.** A real conversation responds to what you say. Forms don't. They ask the next question regardless of your answer. The "conversational" tools fake this — they insert your name into a template and call it personalization. It fools nobody.

**Failure 3 — Data captures what you said, not how you said it.** A text box stores words. A voice captures hesitation, excitement, uncertainty, confidence. When a student says "I think... maybe Delhi University?" — that uncertainty is signal. Current tools throw it away completely.

---

## 2. The Insight

> **"It's not a form. It's actually you talking to another person."**

This is the product. Not a form with a chat UI. Not a chatbot that collects fields. Something genuinely new — **structured data collection disguised as a real human conversation, with voice as the primary input.**

The moment a user opens a link and hears a warm voice say "Hey, what should I call you?" — the form has disappeared. That is the experience we are building.

---

## 3. The Solution

A **hybrid voice + text conversational form builder** where:

- **Form creators** describe what they want to collect in plain language. AI builds the form schema, asks for confirmation, generates the shareable link.
- **Form responders** choose to talk or type. Either way, an AI guides them through a natural conversation, confirms what it understood, and fills the form on their behalf.
- **After submission**, the responder sees a clean summary of what they shared. The creator sees structured data in a dashboard.

The conversation is the interface. The form is invisible.

---

## 4. Target Audience

### Primary — V1

**Student organizers and community builders** — people running college events, hackathons, GDG chapters, club registrations. They need forms constantly, have no budget, and are the most likely to appreciate and share something genuinely better.

**Indie makers and early-stage founders** — people building in public, running waitlists, collecting user research. They care deeply about conversion rates and user experience.

### Secondary — Post V1

**Small businesses** in India — local coaching centers, event organizers, small teams who find Google Forms too rigid but Typeform too expensive.

**Recruiters and HR** at startups — voice responses for initial screening is a category nobody has built well for the SMB market.

### Geography
India-first. Hinglish support, zero cost positioning, built by a student for the community — this story resonates most here first.

---

## 5. Competitive Landscape

| Product | Voice Input | True Conversation | Free | India-Aware | Open Source |
|---|---|---|---|---|---|
| Google Forms | ✗ | ✗ | ✓ | Partial | ✗ |
| Typeform | ✗ | Partial | ✗ | ✗ | ✗ |
| Tally | ✗ | ✗ | Partial | ✗ | ✗ |
| Formshare | ✗ | Partial | ✓ | ✗ | ✗ |
| ConvoForm | ✗ | Partial | ✓ | ✗ | ✓ |
| Voiz Report | ✓ | ✗ | ✗ | ✗ | ✗ |
| **This product** | **✓** | **✓** | **✓** | **✓** | **✓** |

**Key differentiator:** Every competitor is building a better form. We are building a better conversation. These are fundamentally different goals.

---

## 6. Product Philosophy

**Six principles that every decision must answer to:**

1. **The form must be invisible.** If the user ever feels like they're filling a form, we've failed.

2. **Voice is primary, text is equal.** Not a voice product with text fallback. Not a text product with voice sprinkled in. Two genuinely excellent input modes.

3. **The AI must actually listen.** Responses must reference what the user said, use their name, react to their answers. Generic acknowledgements ("Great!") are banned from the product.

4. **Radical transparency on data.** Users know exactly what is recorded, who sees it, how long it's kept. No dark patterns, ever.

5. **Zero cost is a feature, not a constraint.** The product is free forever. BYOK (Bring Your Own Key) for the AI layer means we never profit from usage limits.

6. **Built for India, ready for the world.** Hinglish, noisy environments, low-bandwidth conditions are first-class concerns, not afterthoughts.

---

## 7. V1 Feature Scope

### Admin Features
- [ ] Natural language form creation ("Ask name, age, class, college preferences")
- [ ] AI-generated schema with field type suggestions (text, number, email, etc.)
- [ ] Schema confirmation and editing before publish
- [ ] Shareable link generation
- [ ] Dashboard showing all submissions as structured data
- [ ] Indicator per submission: voice or text input method
- [ ] API key input (Gemini + Groq) entered once by admin during onboarding, encrypted and stored in Supabase Vault, retrieved server-side only when responders trigger API calls. Keys are never exposed to the client at any point.

### Responder Features
- [ ] Choice screen: Talk or Type
- [ ] Voice flow: AI speaks question → user responds → live transcription shown → AI confirms and continues
- [ ] Text flow: AI messages question → user types → AI acknowledges and continues
- [ ] Review screen: full filled form shown before submit
- [ ] Editable fields on review screen
- [ ] Submission confirmation with personal summary
- [ ] Skip any question

### Not in V1 (explicitly)
- Integrations (Sheets, Notion, webhooks)
- Analytics and completion rates
- Custom branding
- Logic branching / conditional questions
- Emotion detection
- Multilingual (beyond basic Hinglish tolerance)
- Team collaboration on admin side
- File upload questions
- Payment collection

---

## 8. User Flows

### Flow A — Admin Creates a Form

```
Landing page
  → Admin clicks "Create a Form"
  → Auth screen (Supabase magic link or Google OAuth)
  → Form creation screen
      → Single input: "What do you want to collect?"
      → Admin types in natural language
      → Gemini API processes → returns proposed schema
      → Confirmation screen shows:
          Field name | Field type | Edit option
          -----------------------------------
          Name       | Text       | [Edit]
          Age        | Number     | [Edit]
          Class      | Text       | [Edit]
          College    | Text       | [Edit]
          [+ Add field] [Confirm & Create]
      → Admin confirms (or edits)
      → Form saved to Supabase
      → Success screen with:
          - Shareable link
          - Copy link button
          - Go to Dashboard button
```

### Flow B — Responder Fills via Voice

```
Opens shareable link
  → Welcome screen
      - What this form is about (form title/context)
      - Privacy notice: "Your voice will be recorded. [Who sees it, how long it's kept]"
      - Two buttons: [🎤 Let's Talk] [⌨️ I'll Type]
  → Clicks "Let's Talk"
  → Browser microphone permission prompt
      - If denied → gentle message + auto switch to text mode
      - If granted → voice flow begins
  → AI speaks first question (Web Speech API TTS)
  → Waveform animation shows AI is speaking
  → Waveform shifts to listening state
  → User speaks
  -> As soon as silence is detected (user stops speaking), UI immediately transitions to 'Thinking' state — waveform shifts to a slow pulsing animation, a subtle label appears ('thinking...' or similar). This state persists until the first token of the AI response is received. This gap will be 1-3 seconds in practice and must never be blank or static
  → Live transcription appears on screen
  → Audio sent to Groq (Whisper) → transcript returned
  → Transcript + history sent to Gemini → conversational response generated
  → AI speaks response + next question
  → Loop until all questions done
  → Review screen:
      All fields shown as editable inputs
      Pre-filled with AI-understood answers
      [Edit any field] [Submit]
  → Submission saved to Supabase
  → Confirmation screen:
      "Here's what you shared, [Name]."
      Clean summary of all answers
      Subtle thank you message
```

### Flow C — Responder Fills via Text

```
Opens shareable link
  → Same welcome screen
  → Clicks "I'll Type"
  → Chat interface appears
  → AI sends first message (text only, no TTS)
  → User types response
  → Message sent to Gemini with conversation history
  → AI responds naturally, asks next question
  → Loop until all questions done
  → Same review screen as voice flow
  → Same submission and confirmation flow
```

### Flow D — Admin Views Dashboard

```
Admin logs in
  → Dashboard shows list of forms created
  → Clicks a form
  → Submissions table:
      Row per submission | Column per field
      Input method badge (Voice / Text)
      Timestamp
      [View full response] for each row
  → Click individual submission → full conversation transcript shown
```

---

## 9. Technical Architecture

### Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) with TypeScript | Full-stack, one codebase, Vercel-native |
| Styling | Tailwind CSS | Utility-first, fast iteration |
| Database | Supabase (PostgreSQL) | Free tier, auth included, real-time ready |
| Auth | Supabase Auth (Google OAuth + Magic Link) | Zero config, free |
| Hosting | Vercel | Free tier, auto-deploy from GitHub |
| AI — Conversation | Gemini 1.5 Flash API (user's own key) | Free, fast, context-aware |
| AI — Speech to Text | Groq Whisper API (user's own key) | Free tier, fast transcription |
| AI — Text to Speech | Web Speech Synthesis API (browser built-in) | Zero cost, zero latency |
Upstash Redis | Rate limiting on API routes | Free tier, Vercel-native integration

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                  │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  Admin UI    │    │     Responder UI           │   │
│  │  Form Builder│    │  Voice / Text Chat         │   │
│  └──────┬───────┘    └────────────┬─────────────┘   │
│         │                         │                  │
│         │              ┌──────────▼──────────┐       │
│         │              │  Web Speech API      │       │
│         │              │  (TTS - browser)     │       │
│         │              └──────────────────────┘       │
└─────────┼───────────────────────┼────────────────────┘
          │                       │
          ▼                       ▼
┌─────────────────────────────────────────────────────┐
│                 NEXT.JS API ROUTES                   │
│                                                      │
│  /api/create-form     → Calls Gemini to parse NL    │
│  /api/converse        → Calls Gemini for response   │
│  /api/transcribe      → Calls Groq Whisper          │
│  /api/submit          → Saves to Supabase           │
└──────┬──────────────────────┬──────────────────────┘
       │                      │
       ▼                      ▼
┌─────────────┐      ┌────────────────────┐
│  Supabase   │      │   External APIs     │
│             │      │                    │
│  - forms    │      │  Gemini 1.5 Flash  │
│  - fields   │      │  (User's API key)  │
│  - responses│      │                    │
│  - users    │      │  Groq Whisper      │
│             │      │  (User's API key)  │
└─────────────┘      └────────────────────┘
```

### API Key Handling (Critical)

Admin enters keys once → stored in Supabase Vault (encrypted at rest) → Next.js API routes fetch keys server-side per request using the form's owner ID → external API calls made server-side only → only the result is returned to client.

---

## 10. Data Models

### `users`
```sql
id          uuid primary key
email       text unique
created_at  timestamp
```

### `forms`
```sql
id            uuid primary key
user_id       uuid references users(id)
title         text
description   text
created_at    timestamp
is_active     boolean default true
```

### `fields`
```sql
id          uuid primary key
form_id     uuid references forms(id)
label       text
field_type  text  -- 'text' | 'number' | 'email' | 'textarea'
required    boolean default false
order_index integer
```

### `responses`
```sql
id            uuid primary key
form_id       uuid references forms(id)
input_method  text  -- 'voice' | 'text'
submitted_at  timestamp
```

### `answers`
```sql
id           uuid primary key
response_id  uuid references responses(id)
field_id     uuid references fields(id)
value        text
```

### `transcripts`
```sql
id          uuid primary key
response_id uuid references responses(id)
messages    jsonb  -- full conversation history array
```

---

## 11. API Design

### `POST /api/create-form`
**Purpose:** Parse natural language input into form schema

**Request:**
```json
{
  "prompt": "Ask name, age, class and college preferences",
  "geminiKey": "AIza..."
}
```

**Response:**
```json
{
  "title": "Student Information Form",
  "fields": [
    { "label": "Name", "field_type": "text", "required": true },
    { "label": "Age", "field_type": "number", "required": true },
    { "label": "Class", "field_type": "text", "required": true },
    { "label": "College Preferences", "field_type": "textarea", "required": false }
  ]
}
```

### `POST /api/transcribe`
**Purpose:** Convert voice audio to text via Groq Whisper

**Request:** `multipart/form-data` with audio blob + groqKey header

**Notes** Frontend must record using MediaRecorder with audio/webm;codecs=opus at a low bitrate (32kbps sufficient for voice). This keeps audio files well under Vercel's 4.5MB serverless request body limit. Max recording duration per question should be capped at 60 seconds on the frontend as an additional safeguard.

**Response:**
```json
{
  "transcript": "My name is Puneet"
}
```

### `POST /api/converse`
**Purpose:** Generate next conversational AI response

**Notes** The Gemini system prompt must include strict behavioral constraints: role-locked to data collection only, explicit instruction to redirect off-topic responses back to the current question, and structured JSON output enforced so that any non-compliant response is caught at parse time and handled gracefully rather than displayed to the user.

**Request:**
```json
{
  "formContext": { "title": "...", "fields": [...] },
  "conversationHistory": [...],
  "latestUserMessage": "My name is Puneet",
  "currentFieldIndex": 0,
  "geminiKey": "AIza..."
}
```

**Response:**
```json
{
  "aiMessage": "Nice to meet you Puneet! How old are you?",
  "extractedValue": "Puneet",
  "nextFieldIndex": 1,
  "isComplete": false
}
```

### `POST /api/submit`
**Purpose:** Save completed form response to Supabase

**Request:**
```json
{
  "formId": "uuid",
  "inputMethod": "voice",
  "answers": [
    { "fieldId": "uuid", "value": "Puneet" },
    { "fieldId": "uuid", "value": "20" }
  ],
  "transcript": [...]
}
```

---

## 12. Edge Cases & Handling

| Scenario | Handling |
|---|---|
| User denies microphone | Graceful message + automatic switch to text mode |
| Groq transcription fails | Retry once → show text input for that question only |
| AI gives wrong field type | Admin can edit schema before publishing |
| User is silent for 8 seconds | AI gently prompts: "Take your time, I'm still here" |
| User is silent for 15 seconds | AI offers: "Would you like to switch to typing?" |
| Answer doesn't match field type | AI pushes back naturally: "I need a number for age — roughly how old are you?" |
| User wants to skip a question | Every question is skippable. "Skip" option always visible |
| Noisy environment | Live transcription shown so user can verify what was heard |
| Code-switching (Hinglish) | Whisper handles this natively — no special handling needed |
| Network failure mid-conversation | State preserved in React, user can retry last message |
| Gemini API key invalid | Clear error on onboarding with link to get a valid key |
| Very long answer | AI summarises what it understood and confirms before moving on |
| Bot or spam hits /api/converse or /api/transcribe repeatedly | Upstash Redis rate limiter on all AI API routes — max 50 requests per IP per hour per form. Exceeding limit returns a 429 with a human-readable message: "You're going too fast — please wait a moment before continuing."
| User attempts prompt injection ("ignore previous instructions") | System prompt locks Gemini to role with explicit redirect instruction. Response format enforced as structured JSON — any non-parseable response triggers a graceful fallback: AI repeats the current question without acknowledging the injection attempt.
---

## 13. Design Language

### Core Principle
Every design decision must answer: **does this feel like a conversation or does this feel like a form?** If it feels like a form, change it.

### Visual Direction
**Warm dark.** Not cold dark like a terminal. Warm dark like a late-night conversation. Deep navy-black backgrounds with cream/warm white text. Soft amber or sage green accents. Nothing blue-grey or corporate.

### Typography
- **Display / AI messages:** A humanist serif — something with warmth and personality. Considered: `Lora`, `Fraunces`, `Playfair Display`. Final choice to be made in implementation but must feel like a voice, not a UI.
- **Body / UI elements:** A geometric sans that's clean but not sterile. Considered: `DM Sans`, `Outfit`. Never Inter, never Roboto.

### Key UI Moments

**The choice screen (Talk or Type)**
Full screen. Minimal. Two options centered. No clutter. Sets the tone for everything that follows. Copy should feel human — not "Select input method."

**The voice listening state**
Subtle animated waveform that reacts to audio input. Soft glow. The rest of the screen is quiet. The waveform is the only thing moving. This is the most important visual in the product.

**The AI speaking state**
Text appears word by word (streaming). Feels like someone talking. Not a block of text dumped at once.

**The review screen**
Clean form with all fields pre-filled. Feels like a finished document, not a form to fill. Editable on tap. Submit button is prominent but not pushy.

**The confirmation screen**
Personal. Uses their name. Summarises what they shared. Feels like the end of a real conversation, not a success toast.

**The Thinking State**
A slow, rhythmic pulse. Different from the listening waveform (reactive, fast) and the speaking waveform (outward, expansive). The thinking pulse is calm and inward. Signals processing without implying something is wrong.

### Sound Design
- Soft chime when conversation starts
- Subtle click when AI finishes speaking and starts listening
- Warm completion sound on submission
- All sounds optional — respects system silent mode

---

## 14. Open Source Strategy

**License:** MIT

**Repository structure:**
```
/
├── app/                  # Next.js app router
│   ├── (admin)/         # Admin pages
│   ├── (responder)/     # Form filling pages
│   └── api/             # API routes
├── components/
│   ├── voice/           # Voice UI components
│   ├── chat/            # Text chat components
│   └── dashboard/       # Admin dashboard
├── lib/
│   ├── gemini.ts        # Gemini API wrapper
│   ├── groq.ts          # Groq Whisper wrapper
│   └── supabase.ts      # Supabase client
├── types/
└── README.md
```

**README must include:**
- What this is and why it exists (the story)
- Live demo link
- One-click deploy to Vercel button
- How to get Gemini and Groq API keys (with screenshots)
- How to contribute

**Build in public:**
- Weekly progress updates on LinkedIn and Twitter
- GitHub discussions open for feature requests
- Changelog maintained from day one

---

## 15. Distribution Plan

### Phase 1 — Before Launch (Building)
- Build in public on LinkedIn and Twitter/X
- Share weekly progress: what was built, what was learned, what broke
- Document the "why" — the problem, the insight, the journey

### Phase 2 — Soft Launch
- Use the product for all GDG Rishihood event registrations
- Share with personal network — founders, students, makers
- Collect qualitative feedback from first 20-30 real users

### Phase 3 — Public Launch
- Product Hunt launch with demo video and clear tagline
- Hacker News: Show HN post
- Peerlist (strong Indian maker community)
- Relevant subreddits: r/SideProject, r/Entrepreneur, r/india
- Dev.to and Hashnode articles: "How I built a voice-first form tool for free"

### Phase 4 — Community Growth
- Reach out to other GDG chapters across India
- College tech communities — college fests, hackathons, coding clubs
- IndieHackers profile and milestone posts

### Ongoing
- Every person who fills a form using this product sees the branding on the confirmation screen
- "Made with [Product Name]" on free tier — organic loop

---

## 16. V1 Build Timeline

| Week | Focus | Deliverables |
|---|---|---|
| Week 1 | Foundation | Next.js setup, Supabase schema, auth, admin can type NL → Gemini parses → schema saved |
| Week 2 | Text responder flow | Shareable link, full text chat flow, review screen, submission saved, basic dashboard |
| Week 3 | Voice layer | Groq Whisper integration, Web Speech TTS, full voice flow working end to end |
| Week 4 | Polish + edge cases | Choice screen, error handling, all edge cases from Section 12, confirmation screen, README |

**Target: Working V1 in 4 weeks of consistent building.**

---

## 17. Success Metrics

### V1 Success = answering these questions with evidence

| Question | Metric | Target |
|---|---|---|
| Do people actually use voice? | % of submissions via voice | >40% |
| Do people complete the form? | Completion rate | >70% (vs ~50% industry avg for forms) |
| Do people feel it's different? | Qualitative feedback | "This doesn't feel like a form" heard repeatedly |
| Is it shareable? | Organic shares without asking | At least 10 in first month |
| Is the builder fast? | Time from signup to shareable link | Under 3 minutes |

---

## 18. What V1 Deliberately Ignores

These are real features. They are not in V1 because they are not needed to validate the core hypothesis.

- Third-party integrations (Google Sheets, Notion, Airtable, webhooks)
- Analytics (completion rates, drop-off, heatmaps)
- Custom branding and white-labelling
- Conditional logic and branching
- Emotion / sentiment detection on voice
- Multilingual interface (Hinglish tolerance via Whisper is enough for now)
- Team accounts and collaboration
- File upload question type
- Payment collection
- Embeddable widget
- Mobile app

---

## 19. Future Roadmap

### V2 — After V1 validation
- Emotion signal layer — show admin where users hesitated or sounded uncertain
- Basic analytics — completion rates, average time, voice vs text split
- Google Sheets integration — most requested integration in all form tools

### V3
- Logic branching — "if they say X, ask Y next"
- Multilingual — full Hindi, Tamil, Bengali support
- Custom AI persona — admin defines tone (professional, casual, friendly, direct)
- Embeddable widget for any website

### V4 and Beyond
- The form that pre-fills itself from LinkedIn/social profiles
- Multiplayer forms — two people filling together
- API for developers to build on top of
- White-label for enterprises

---

## Closing Note

Every competitor in this space is trying to build a better form. This product is trying to make forms disappear entirely.

The north star is simple: a user opens a link, talks for two minutes, and never once thinks "I just filled a form." They think "I just had a conversation."

That experience, built well, is worth building.

---

*This PRD is a living document. It will be updated as we learn from real users.*
