# 🤖 MISSI — Mistral Intelligent Super System Interface

> **A voice-first AI operating system** powered by 6 specialized Mistral models, 28 autonomous tools, and 10,000+ integrations — built for the **Mistral AI Worldwide Hackathon 2026**.

🌐 **[Live Demo](https://jarvis-eta-smoky.vercel.app)** · 🎬 **[Demo Video](#)** · 🏢 **[MiMi Tech AI](https://mimitechai.com)**

---

## What is MISSI?

MISSI is a **voice-first AI operating system** that understands you in 10 languages, intelligently routes every query to the optimal Mistral model, executes multi-step workflows autonomously, and responds with natural human-like speech.

**Speak → MISSI routes to the best model → Executes tools autonomously → Speaks back naturally.**

### Why MISSI Stands Out

| Feature | MISSI | Typical Chatbots |
|---------|-------|-----------------|
| **Model Selection** | 6 specialized Mistral models, auto-routed per query | Single model |
| **Voice** | Voxtral STT + ElevenLabs TTS, continuous conversation | Text only or basic TTS |
| **Tools** | 28 built-in + 10,000+ via Composio | Limited or none |
| **Languages** | 10 languages, auto-detected from browser | English only |
| **Integrations** | Gmail, Calendar, GitHub, Slack, Notion, Drive | None or manual |
| **Documents** | Professional HTML reports with charts & tables | Plain text |

---

## 🧠 6-Model Intelligent Routing

MISSI analyzes every message and selects the optimal Mistral model in real-time:

| Query Type | Model | Trigger Examples |
|-----------|-------|-----------------|
| General intelligence | `mistral-large-latest` 🧠 | Research, analysis, questions |
| Fast responses | `mistral-small-latest` ⚡ | Greetings, simple queries |
| Deep reasoning | `magistral-medium-latest` 🧮 | Math, logic, proofs, comparisons |
| Creative writing | `mistral-medium-latest` 🎨 | Stories, poems, creative content |
| Code generation | `codestral-latest` 💻 | Programming, debugging, scripts |
| Image analysis | `pixtral-large-latest` 👁️ | Photo analysis, OCR, diagrams |

Additional models used internally:
- **`voxtral-small-latest`** — Speech-to-text (Mistral-native STT)
- **`mistral-ocr-latest`** — Document OCR and analysis

---

## 🛠️ 28 Agent Tools

### Core Intelligence
| Tool | Description |
|------|-------------|
| `web_search` | Real-time web search via Brave API |
| `read_webpage` | Extract content from any URL |
| `wikipedia` | Wikipedia knowledge in any language |
| `news_headlines` | Latest news via Google News RSS |
| `get_weather` | Weather + 3-day forecast (Open-Meteo) |
| `get_time` | Current time in any timezone |
| `get_location` | Browser geolocation |

### Finance & Data
| Tool | Description |
|------|-------------|
| `get_stock_price` | Real-time stock prices (Yahoo Finance) |
| `get_crypto_price` | Live crypto prices (CoinGecko) |
| `calculate` | Mathematical computations |
| `analyze_data` | Statistical analysis & pattern finding |
| `unit_convert` | Temperature, length, weight, volume, speed, data |
| `generate_chart` | Bar, line, pie, area charts (SVG) |

### Creation & Documents
| Tool | Description |
|------|-------------|
| `run_code` | Execute JavaScript in sandbox |
| `generate_code` | Production code via Codestral |
| `create_document` | Professional HTML reports with tables & metrics |
| `analyze_document` | OCR via `mistral-ocr-latest` |
| `translate` | Multi-language translation |
| `summarize_text` | Intelligent text summarization |
| `define_word` | Dictionary with synonyms & examples |
| `random_fact` | Curated facts & trivia |

### Integrations (Composio — Permission-Gated)
| Tool | Description |
|------|-------------|
| `search_gmail` / `read_gmail` | Gmail inbox search & reading |
| `get_calendar` | Google Calendar events |
| `get_github` | GitHub repos, issues, create issues |
| `search_files` | Google Drive file search |
| `set_reminder` | Browser notification reminders |
| `change_voice` | Switch between 6 ElevenLabs voices |

---

## 🎙️ Voice System

MISSI's voice pipeline is designed for natural, continuous conversation:

1. **Voxtral STT** — Mistral-native speech-to-text (not browser APIs)
2. **Intelligent Processing** — Auto-routes to optimal model
3. **ElevenLabs TTS** — Full response spoken as continuous natural speech
4. **Auto-Relisten** — Immediately listens for your next input

### Voice Features
- **Continuous Conversation** — Speak naturally back-and-forth
- **10 Languages** — Auto-detected from browser, switchable in UI
- **6 Switchable Voices** — Sarah, Aria, Rachel, Eric, Roger, Charlie
- **VoiceOrb Visualization** — Animated state indicator (idle → listening → thinking → speaking)
- **Keyboard Shortcuts** — Space (voice), Escape (stop), ⌘K (clear)

---

## 📄 Canvas Panel

MISSI generates professional documents rendered in a side panel:

- **HTML Documents** — Styled reports with tables, metrics, charts
- **Traffic Light Controls** — Close (🔴), minimize (🟡), fullscreen (🟢)
- **Download** — HTML or Markdown format
- **Print-Ready** — Optimized CSS for printing

Documents include CSS components: stat cards, info cards, comparison grids, progress bars, timelines, and data tables.

---

## 🔌 10,000+ Integrations (Composio)

One-click OAuth connection via [Composio](https://composio.dev):

| Integration | Status | Features |
|---|---|---|
| 📧 **Gmail** | ✅ Connected | Search, read, send emails |
| 📅 **Google Calendar** | ✅ Connected | View, create, manage events |
| 🐙 **GitHub** | ✅ Connected | Repos, issues, create issues |
| 💬 **Slack** | Available | Messages, channels |
| 📝 **Notion** | Available | Pages, databases |
| 📁 **Google Drive** | Available | Files, sharing |
| ➕ **10,000+ more** | Via Composio | Managed OAuth & token refresh |

---

## 🌍 Internationalization

MISSI auto-detects the browser language and switches the entire UI:

- **10 Languages:** 🇩🇪 DE · 🇺🇸 EN · 🇫🇷 FR · 🇪🇸 ES · 🇮🇹 IT · 🇵🇹 PT · 🇯🇵 JA · 🇰🇷 KO · 🇨🇳 ZH · 🇷🇺 RU
- Welcome screen, badges, placeholders, footer — all localized
- AI responses match the selected language
- TTS automatically selects the optimal voice model per language

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│            MISSI Frontend (Next.js 16)          │
│  VoiceOrb ← Web Audio API ← ElevenLabs TTS     │
│  Voxtral STT → Chat → Vision → Canvas Panel    │
└──────────────────────┬──────────────────────────┘
                       │ SSE Streaming
┌──────────────────────▼──────────────────────────┐
│          Intelligent Model Router                │
│    Query Analysis → Optimal Model Selection      │
│  ⚡small 🧠large 💻codestral 👁️pixtral 🧮magistral 🎨medium │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│        Autonomous Planning Engine                │
│    Task Decomposition → Multi-Step Execution     │
│    Up to 8 rounds × 28 tools                    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│     28 Built-in Tools + 10,000+ via Composio    │
│  Search│Weather│Code│Finance│Docs│Gmail│GitHub│… │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16.1.6, React 19, TypeScript, Tailwind CSS 4 |
| **AI Models** | Mistral AI SDK 1.14.1 (6 models + intelligent routing) |
| **Speech-to-Text** | Voxtral Small (Mistral-native) |
| **Text-to-Speech** | ElevenLabs (Turbo v2.5 + Multilingual v2) |
| **Integrations** | Composio V3 Tool Router Session API |
| **Charts** | Custom SVG generation engine |
| **Markdown** | react-markdown + remark-gfm |
| **Deployment** | Vercel |

---

## 🏃 Quick Start

```bash
git clone https://github.com/MimiTechAi/missi.git
cd missi
npm install

# Configure environment
cp .env.example .env.local
# Add your API keys (see below)

npm run dev
# Open http://localhost:3000
```

### Environment Variables

```env
MISTRAL_API_KEY=your_mistral_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
COMPOSIO_API_KEY=your_composio_api_key    # Optional: for Gmail, Calendar, GitHub
```

---

## 🏆 Hackathon Categories

- **🌍 Global Winner** — Full Mistral ecosystem: 6 models + 28 tools + autonomous planning
- **🎙️ Best Voice Use Case (ElevenLabs)** — Continuous voice conversation in 10 languages
- **🤖 Best Use of Agent Skills** — 28 tools with multi-step autonomous execution
- **🔗 Best Integration (Composio)** — Gmail, Calendar, GitHub + 10,000+ tools

---

## 👥 Team

**MiMi Tech AI** — Michael Bemler & Michael Soppa

🌐 [mimitechai.com](https://mimitechai.com) · 🐙 [github.com/MimiTechAi](https://github.com/MimiTechAi)

---

## 📄 License

MIT

---

*Built with ❤️ for the Mistral AI Worldwide Hackathon 2026*
