# 🤖 MISSI — Voice AI Operating System

> **Mistral Intelligent System for Seamless Interaction** — A voice-first AI agent powered by Mistral AI's full model ecosystem with 25 autonomous tools.

Built for the **Mistral AI Worldwide Hackathon 2026** by **MiMi Tech AI**.

## 🎬 Demo

[Live Demo](https://jarvis-eta-smoky.vercel.app) · [Video Demo](#)

## 💡 What is MISSI?

MISSI is not another chatbot. It's a **voice-first AI operating system** that intelligently routes your requests across 4 specialized Mistral models, executes multi-step autonomous workflows with 25 tools, and responds with natural human-like voice — streaming speech sentence-by-sentence as it thinks.

**Speak → MISSI plans → Executes tools autonomously → Speaks back in real-time.**

### Key Differentiators
- 🧠 **4-Model Intelligent Routing** — Automatically selects the best Mistral model per query
- 🎙️ **Voxtral-Native STT** — Mistral's own speech-to-text, not browser APIs
- 🗣️ **Streaming TTS** — Speaks sentences AS they're generated (no waiting)
- 🛑 **Voice Barge-In** — Interrupt MISSI mid-sentence by speaking (GPT-4o style)
- 👁️ **Pixtral Vision** — Drag & drop images for instant analysis
- 📄 **Artifact Canvas** — Claude-style document panel with download
- 🔗 **Perplexity-Style Sources** — Inline source cards with favicons
- 🌍 **10 Languages** — DE, EN, FR, ES, IT, PT, JA, KO, ZH, RU
- 💬 **"Hey Missi" Wake Word** — Hands-free activation

## 🧠 Intelligent Multi-Model Routing

MISSI automatically selects the best Mistral model for each query:

| Query Type | Model | Why |
|-----------|-------|-----|
| Quick questions | `mistral-small-latest` ⚡ | Speed-optimized |
| Deep analysis, research | `mistral-large-latest` 🧠 | Best reasoning |
| Code generation | `codestral-latest` 💻 | Code specialist |
| Image analysis | `pixtral-large-latest` 👁️ | Vision model |

This isn't hardcoded — MISSI analyzes each message and makes real-time routing decisions.

## 🛠️ 25 Agent Tools

### Core Intelligence
| Tool | Description |
|------|-------------|
| 🔍 `web_search` | Real-time internet search (8 results with URLs) |
| 📄 `read_webpage` | Extract content from any URL |
| 📖 `wikipedia` | Wikipedia knowledge in any language |
| 📰 `news_headlines` | Latest news by topic/country |
| 🌤️ `get_weather` | Weather + 3-day forecast for any city |
| 🕐 `get_time` | Current time in any timezone |
| 📍 `get_location` | User's GPS location |

### Finance & Data
| Tool | Description |
|------|-------------|
| 📈 `get_stock_price` | Real-time stock prices (Yahoo Finance) |
| 🪙 `get_crypto_price` | Live crypto prices (CoinGecko) |
| 🔢 `calculate` | Mathematical computations |
| 📊 `analyze_data` | Statistical analysis & pattern finding |
| 🔄 `unit_convert` | Temperature, length, weight, volume, speed, data |

### Creation & Code
| Tool | Description |
|------|-------------|
| 💻 `run_code` | Execute JavaScript code |
| ⌨️ `generate_code` | Production code via Codestral |
| 📝 `create_document` | Generate downloadable reports & documents |
| 🌐 `translate` | Multi-language translation |
| 📋 `summarize_text` | Summarize long content |
| 📖 `define_word` | Dictionary definitions, synonyms, examples |
| 💡 `random_fact` | Interesting facts & trivia |

### Integrations (Permission-Gated)
| Tool | Description |
|------|-------------|
| 📧 `search_gmail` / `read_gmail` | Gmail inbox search & reading |
| 📂 `search_files` | Local file search (File System Access API) |
| 📅 `get_calendar` | Google Calendar events |
| ⏰ `set_reminder` | Browser notification reminders |
| 🎭 `change_voice` | Switch between 6 ElevenLabs voices |

## 🔄 Autonomous Multi-Step Planning

For complex requests, MISSI decomposes tasks into steps and executes them autonomously:

```
User: "Research quantum computing breakthroughs and create a summary report"

MISSI Plan:
  1. ✓ Search for latest quantum computing news
  2. ✓ Read top 3 articles  
  3. ✓ Analyze and compare findings
  4. ✓ Create structured report document
  5. ✓ Summarize key insights verbally
```

Up to 8 rounds of autonomous tool execution for complex workflows.

## 🎙️ Voice Interaction

- **Voxtral STT** — Mistral-native speech-to-text (not browser SpeechRecognition)
- **ElevenLabs TTS** — Natural, human-like voice with 6 switchable voices
- **Streaming TTS** — Speaks sentences as they arrive (no waiting for full response)
- **Voice Barge-In** — Interrupt MISSI by speaking (mic monitors during playback)
- **"Hey Missi" Wake Word** — Hands-free activation
- **Continuous Conversation** — Back-and-forth without clicking
- **Filler Audio** — Speaks "Let me check..." while thinking (like a human)
- **Audio-reactive VoiceOrb** — Canvas visualization responds to voice in real-time
- **10 Languages** — Auto-detected from browser, switchable in UI

## 👁️ Vision (Pixtral)

Drag & drop or upload any image — MISSI uses Pixtral Large for detailed analysis:
- Photo analysis & description
- Text extraction from screenshots
- Diagram interpretation
- Object & scene recognition

## 🎨 UI/UX Design

- **ChatGPT-style layout** — Clean, no-bubble assistant messages with avatars
- **Perplexity-style sources** — Inline source cards with favicons and domains
- **Claude-style Artifact Canvas** — Side panel for documents with copy & download
- **Live Tool Cards** — Streaming tool execution progress with status indicators
- **Live Browsing Panel** — Shows which pages MISSI is reading in real-time
- **Follow-up Suggestions** — 3 contextual follow-up buttons after each response
- **Animated VoiceOrb** — State-aware (idle/listening/thinking/speaking) with particles
- **Keyboard Shortcuts** — Space (voice), Escape (stop), Cmd+K (focus input)

## 🏗️ Architecture

```
┌────────────────────────────────────────────────┐
│           MISSI Frontend (Next.js 16)          │
│   VoiceOrb ← Web Audio API ← ElevenLabs       │
│   Voxtral STT → Chat → Vision → Downloads     │
└────────────────────┬───────────────────────────┘
                     │ SSE Streaming
┌────────────────────▼───────────────────────────┐
│         Intelligent Model Router                │
│   Query Analysis → Model Selection              │
│   ⚡ small │ 🧠 large │ 💻 codestral │ 👁️ pixtral │
└────────────────────┬───────────────────────────┘
                     │
┌────────────────────▼───────────────────────────┐
│       Autonomous Planning Engine                │
│   Task Decomposition → Parallel Execution       │
│   Up to 8 rounds × 25 tools                    │
└────────────────────┬───────────────────────────┘
                     │
┌────────────────────▼───────────────────────────┐
│         25 Agent Tools (Parallel Execution)     │
│   Search │ Weather │ Code │ Finance │ Docs │...│
└────────────────────────────────────────────────┘
```

## 🚀 Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **AI Models:** Mistral AI SDK (4 models with intelligent routing)
- **Voice In:** Voxtral Mini (Mistral-native STT)
- **Voice Out:** ElevenLabs (Flash v2.5 + Multilingual v2)
- **Audio:** Web Audio API for real-time visualization & barge-in detection
- **Deploy:** Vercel (Edge-optimized)
- **Dev:** Built with Mistral Vibe CLI

## 🏃 Quick Start

```bash
git clone https://github.com/MimiTechAi/missi.git
cd missi
npm install

# Add your API keys
cp .env.example .env.local
# Edit .env.local with your keys

npm run dev
# Open http://localhost:3000
```

## 📦 Environment Variables

```
MISTRAL_API_KEY=your_mistral_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

## 🏆 Hackathon Prizes Targeted

- **Global Winner** — Full Mistral ecosystem (4 models + 25 tools + autonomous planning)
- **Best Voice Use Case (ElevenLabs)** — Streaming TTS + Barge-In + 6 voices + 10 languages
- **Best Use of Agent Skills** — 25 tools with autonomous multi-step planning
- **Best Vibe Usage** — Project developed with Mistral Vibe CLI

## 👥 Team

**MiMi Tech AI** — Michael Bemler & Michael Soppa

- 🌐 [mimitechai.com](https://mimitechai.com)
- 🐙 [github.com/MimiTechAi](https://github.com/MimiTechAi)

## 📄 License

MIT

---

*Built with ❤️ at the Mistral AI Worldwide Hackathon 2026*
