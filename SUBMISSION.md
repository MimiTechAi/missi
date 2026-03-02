# MISSI — Hackathon Submission

## Project Name
MISSI — Mistral Intelligent Super System Interface

## One-Liner
A voice-first AI operating system that intelligently routes queries across 6 specialized Mistral models, executes 28 autonomous tools, and speaks back naturally in 10 languages.

## Links
- **Live Demo:** https://jarvis-eta-smoky.vercel.app
- **GitHub:** https://github.com/MimiTechAi/missi
- **English UI:** https://jarvis-eta-smoky.vercel.app/?lang=en
- **French UI:** https://jarvis-eta-smoky.vercel.app/?lang=fr

## Team
**MiMi Tech AI** — Michael Bemler & Michael Soppa
🌐 mimitechai.com · 🐙 github.com/MimiTechAi

---

## Description

### The Problem

Today's AI assistants are text-first, single-model, and isolated. They use one model for everything, can't connect to your real tools, and treat voice as an afterthought. Users are forced to type, copy-paste results between apps, and accept a one-size-fits-all model regardless of their query.

### Our Solution: MISSI

MISSI is a **voice-first AI operating system** that reimagines how humans interact with AI. Instead of a simple chatbot, MISSI is a fully autonomous agent that listens, thinks, acts, and speaks — leveraging the **entire Mistral model ecosystem** to deliver the right intelligence for every query.

**The core insight:** Different queries demand different models. A greeting doesn't need the same compute as a mathematical proof. Code generation benefits from a specialized model. Creative writing needs a different approach than data analysis. MISSI makes this selection automatically and invisibly.

---

### 🧠 6-Model Intelligent Routing — The Full Mistral Ecosystem

MISSI is the only project that uses **8 different Mistral models** (6 for inference, 2 for processing) with real-time intelligent routing:

| Query Type | Model | Why This Model |
|-----------|-------|----------------|
| General intelligence | `mistral-large-latest` | Best overall reasoning and knowledge |
| Fast responses | `mistral-small-latest` | Sub-second greetings and simple queries |
| Deep reasoning & math | `magistral-medium-latest` | Chain-of-thought for proofs, logic, comparisons |
| Creative writing | `mistral-medium-latest` | Stories, poems, haikus, creative content |
| Code generation | `codestral-latest` | Purpose-built code specialist |
| Image analysis | `pixtral-large-latest` | Vision model for photos, screenshots, diagrams |
| Speech-to-text | `voxtral-small-latest` | Mistral-native STT (not browser APIs) |
| Document OCR | `mistral-ocr-latest` | Extract text from PDFs and images |

**This isn't hardcoded keyword matching.** MISSI analyzes the semantic intent of every message — detecting whether it's a greeting, a code request, a reasoning challenge, or a creative task — and routes to the optimal model in real-time. The user never thinks about which model to use. MISSI just works.

---

### 🎙️ True Voice-First Experience

MISSI was designed voice-first, not text-first-with-voice-bolted-on:

**Speech-to-Text:** Powered by **Voxtral Small** (Mistral's own STT model), not browser SpeechRecognition APIs. This gives us Mistral-native accuracy across all 10 supported languages.

**Text-to-Speech:** **ElevenLabs** with intelligent language detection — automatically selects `eleven_turbo_v2_5` for the 11 most common languages (English, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Japanese, Korean, Chinese) for ultra-low latency, and falls back to `eleven_multilingual_v2` for less common languages.

**Continuous Conversation:** After MISSI speaks, she automatically starts listening for your next input. No button clicks needed. Just talk naturally, like speaking to a colleague.

**6 Switchable Voices:** Sarah (warm female, default), Aria (bright female), Rachel (calm female), Eric (smooth male), Roger (deep male), Charlie (British male). Switch mid-conversation by saying "Change voice to Roger."

**10 Languages:** German, English, French, Spanish, Italian, Portuguese, Japanese, Korean, Chinese, Russian. The entire UI auto-localizes — welcome screen, suggestion cards, capability badges, placeholder text, footer — everything switches when you change language or when MISSI detects your browser language.

**VoiceOrb:** An animated, audio-reactive visualization that shows MISSI's state — idle (pulsing blue), listening (expanding rings), thinking (spinning), speaking (waveform). Built with Canvas API and Web Audio API for real-time audio level visualization.

---

### 🛠️ 28 Autonomous Tools

MISSI doesn't just chat — she **acts**. With 28 built-in tools covering search, finance, code execution, document generation, integrations, and more:

**Web Intelligence:**
- `web_search` — Real-time internet search via Brave API with source cards
- `read_webpage` — Extract and parse content from any URL
- `wikipedia` — Multi-language Wikipedia knowledge base
- `news_headlines` — Latest headlines via Google News RSS (by topic and country)

**Real-Time Data:**
- `get_weather` — Current weather + 3-day forecast for any city (Open-Meteo)
- `get_stock_price` — Live stock prices with day range, 52-week range, market status (Yahoo Finance)
- `get_crypto_price` — Cryptocurrency prices with 24h change, market cap, volume (CoinGecko)
- `get_time` — Current time in any timezone worldwide
- `get_location` — Browser geolocation

**Computation & Analysis:**
- `calculate` — Mathematical computations (any expression)
- `analyze_data` — Statistical analysis, pattern finding, insights from structured data
- `unit_convert` — Temperature, length, weight, volume, speed, data conversions
- `generate_chart` — Professional SVG charts (bar, line, pie, area) with gradient fills, grid lines, smart axis labels

**Code & Creation:**
- `run_code` — Execute JavaScript in a sandboxed environment
- `generate_code` — Production-ready code via Codestral (the code specialist model)
- `create_document` — Professional HTML documents with styled tables, metric cards, info cards, progress bars, timelines, and branded headers/footers
- `analyze_document` — OCR and analysis via `mistral-ocr-latest`
- `translate` — Translation between any languages
- `summarize_text` — Intelligent summarization of long content

**Knowledge:**
- `define_word` — Dictionary definitions with synonyms, antonyms, examples
- `random_fact` — Curated interesting facts and trivia

**Integrations (via Composio):**
- `search_gmail` + `read_gmail` — Search and read Gmail inbox (permission-gated)
- `get_calendar` — Google Calendar events
- `get_github` — GitHub repositories, issues, create issues
- `search_files` — Google Drive file search
- `set_reminder` — Browser notification reminders
- `change_voice` — Switch between ElevenLabs voices mid-conversation

---

### 🔗 10,000+ External Integrations via Composio

Beyond the 28 built-in tools, MISSI connects to **10,000+ external services** through Composio's V3 Tool Router Session API:

- **Gmail** ✅ — Search inbox, read emails, compose drafts
- **Google Calendar** ✅ — View events, check availability, create meetings
- **GitHub** ✅ — Browse repos, list issues, create issues
- **Slack** — Send messages, manage channels
- **Notion** — Access pages, query databases
- **Google Drive** — Search files, manage sharing
- **And 10,000+ more** — Salesforce, Jira, Linear, HubSpot, Stripe, Shopify...

Each integration uses **managed OAuth** — users click one button in the sidebar, Composio handles the entire OAuth flow, token refresh, and credential management. No API keys to configure.

---

### 🔄 Autonomous Multi-Step Planning

For complex requests, MISSI decomposes tasks and executes them autonomously — up to **8 rounds** of tool execution per request:

```
User: "Research the latest AI developments and create a summary report"

MISSI autonomously:
  1. → web_search("latest AI developments 2026")
  2. → read_webpage(top 3 results)
  3. → analyze_data(extracted information)
  4. → create_document(structured HTML report with tables & metrics)
  5. → Speaks a verbal summary of key findings
```

The planning engine intelligently decides:
- **Simple queries** (greetings, definitions) → Direct response, no planning
- **Single-tool queries** (weather, stocks) → Single tool call
- **Complex queries** (research, comparisons) → Multi-step autonomous execution

---

### 📄 Professional Document & Chart Output

MISSI generates **publication-quality** documents and charts:

**Documents** are rendered as styled HTML with:
- Google Fonts (Inter) for professional typography
- CSS custom properties for consistent theming
- Metric cards with highlighted numbers (stat-card component)
- Info cards for callouts (success/warning/danger variants)
- Comparison grids (pros/cons side by side)
- Progress bars for visual percentages
- Timeline components for chronological data
- Data tables with gradient headers and hover effects
- Branded header with document type badge and metadata
- Print-optimized CSS

**Charts** use a custom SVG rendering engine:
- Bar charts with gradient fills and rounded corners
- Line charts with area fills and data point markers
- Pie charts with percentage labels inside slices
- Grid lines with smart axis labels (1000 → 1k)
- 10 default colors, customizable

Documents open in a **Canvas Panel** — a side panel with browser-style chrome (traffic light controls: 🔴 close, 🟡 minimize, 🟢 fullscreen in new tab), with download options in HTML or Markdown format.

---

### 🌍 Full Internationalization

MISSI auto-detects the browser language and localizes the **entire UI** — not just AI responses:

- **Welcome screen:** Heading, subtitle, keyboard hints
- **Suggestion cards:** Contextual examples per language (e.g., "Wetter in Berlin" for DE, "Météo à Paris" for FR, "Weather in New York" for EN)
- **Capability badges:** All 10 badges translated (Search/Suche/Recherche, Calendar/Kalender/Calendrier, etc.)
- **Input placeholder:** Language-specific prompt text
- **Footer:** Fully localized
- **AI responses:** System prompt detects user language, responds accordingly
- **TTS:** Automatically selects optimal voice model per language
- **URL override:** `?lang=fr` forces French UI for demos and sharing

---

### 🏗️ Technical Architecture

```
Frontend (Next.js 16.1.6, React 19, TypeScript, Tailwind CSS 4)
    ↓ SSE Streaming
Intelligent Model Router (real-time query analysis)
    ↓ Routes to optimal model
6 Mistral Models (Large, Small, Magistral, Medium, Codestral, Pixtral)
    ↓ Tool calls
Autonomous Planning Engine (up to 8 execution rounds)
    ↓ Executes
28 Built-in Tools + 10,000+ via Composio V3 API
    ↓ Results
SSE Stream → Frontend → Canvas Panel / Chat / TTS
```

**Key Technical Decisions:**
- **SSE streaming** for real-time tool execution feedback (not WebSockets — simpler, Vercel-compatible)
- **Composio V3 Tool Router Session REST API** (not SDK) for maximum reliability
- **Network-first Service Worker** — always serves fresh content, offline fallback only
- **iframe sandboxing** for document rendering (allow-same-origin, allow-scripts)
- **No external CSS frameworks** in documents — self-contained HTML with inline styles and Google Fonts

---

### Hackathon Categories

- 🌍 **Global Winner** — Most comprehensive use of the Mistral ecosystem (8 models, 28 tools, autonomous planning, voice, vision, documents, charts, i18n)
- 🎙️ **Best Voice Use Case (ElevenLabs)** — Continuous multilingual voice conversation with 6 switchable voices, auto-language detection, audio-reactive visualization
- 🤖 **Best Use of Agent Skills** — 28 autonomous tools with multi-step planning, real-time data, code execution, document generation
- 🔗 **Best Integration (Composio)** — Gmail, Google Calendar, GitHub connected via V3 Tool Router Session API + 10,000+ available integrations

---

### What We're Most Proud Of

1. **The model router actually works.** It's not a gimmick — Magistral produces noticeably better reasoning, Codestral writes cleaner code, and Small responds 3x faster for simple queries.

2. **Voice feels natural.** No robotic pauses, no "processing..." messages. Speak → MISSI thinks → MISSI speaks back → listens again. Continuous flow.

3. **Real integrations, not demos.** Gmail actually shows your inbox. Calendar actually shows your events. GitHub actually lists your repos. These aren't mocked responses.

4. **Documents look professional.** Not markdown dumps — actual styled HTML with tables, metric cards, branded headers. Download as HTML or Markdown.

5. **10 languages, not as an afterthought.** The entire UI switches — welcome screen, suggestions, badges, placeholder, footer. MISSI responds and speaks in your language.

---

## Short Description (if character-limited)

MISSI — Voice-first AI OS with 6 Mistral models (Large, Small, Magistral, Medium, Codestral, Pixtral) + Voxtral STT + Mistral OCR, 28 autonomous tools, 10,000+ integrations via Composio, ElevenLabs voice in 10 languages, professional document/chart generation, and full UI internationalization. Speak naturally — MISSI routes to the optimal model, plans & executes autonomously, and speaks back.
