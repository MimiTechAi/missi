# 🤖 MISSI — Voice AI Operating System

> **Just A Rather Very Intelligent System** — A voice-first AI agent powered by Mistral AI's full model ecosystem.

Built for the **Mistral AI Worldwide Hackathon 2026** by **MiMi Tech AI**.

## 🎬 Demo

[Live Demo](https://missi-mimi.vercel.app) · [Video Demo](#)

## 💡 What is MISSI?

MISSI is not another chatbot. It's a **voice-first AI operating system** that intelligently routes your requests across 4 specialized Mistral models, executes multi-step autonomous workflows, and responds with natural human-like voice.

**Speak → MISSI plans → Executes tools autonomously → Speaks back.**

## 🧠 Intelligent Multi-Model Routing

MISSI automatically selects the best Mistral model for each query:

| Query Type | Model | Why |
|-----------|-------|-----|
| Quick questions | `mistral-small-latest` ⚡ | Speed-optimized |
| Deep analysis, research | `mistral-large-latest` 🧠 | Best reasoning |
| Code generation | `codestral-latest` 💻 | Code specialist |
| Image analysis | `pixtral-large-latest` 👁️ | Vision model |

This isn't hardcoded — MISSI analyzes each message and makes real-time routing decisions.

## 🛠️ 12 Agent Tools

| Tool | Description |
|------|-------------|
| 🔍 `web_search` | Real-time internet search |
| 📄 `read_webpage` | Extract content from any URL |
| 🌤️ `get_weather` | Weather with 3-day forecast |
| 🕐 `get_time` | Time in any timezone |
| 🔢 `calculate` | Mathematical computations |
| 💻 `run_code` | Execute JavaScript |
| 📝 `create_document` | Generate downloadable reports |
| 🌐 `translate` | Multi-language translation |
| 📊 `analyze_data` | Statistical analysis |
| ⌨️ `generate_code` | Production code via Codestral |
| ⏰ `set_reminder` | Set reminders |
| 📋 `summarize_text` | Summarize long content |

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

Up to 8 rounds of tool execution for complex workflows.

## 🎙️ Voice Interaction

- **ElevenLabs TTS** — Natural, human-like voice (Eric voice, Flash v2.5 model)
- **Sentence-by-sentence streaming** — No waiting for full response
- **Browser STT** — Web Speech API for voice input
- **Continuous mode** — Hands-free conversation
- **Voice interruption** — Click orb to stop MISSI mid-sentence
- **Audio-reactive visualization** — Orb responds to audio in real-time

## 👁️ Vision (Pixtral)

Drag & drop or upload any image — MISSI uses Pixtral Large for detailed analysis. Try:
- "What's in this image?"
- "Read the text in this screenshot"
- "Describe this diagram"

## 🎨 Design

- Animated Voice Orb with state-based colors and audio-reactive waveforms
- Glassmorphism UI with subtle grid patterns
- Slide-in conversation panel with tool execution details
- Document downloads for generated reports
- Mobile-responsive

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           MISSI Frontend (Next.js)          │
│   VoiceOrb ← Web Audio API ← ElevenLabs    │
│   STT → Chat → Image Upload → Download     │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│         Intelligent Model Router             │
│   Query Analysis → Model Selection           │
│   ⚡ small │ 🧠 large │ 💻 codestral │ 👁️ pixtral │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│       Autonomous Planning Engine             │
│   Task Decomposition → Step Execution        │
│   Up to 8 rounds of tool calls              │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│         12 Agent Tools                       │
│   Search │ Weather │ Code │ Documents │ ...  │
└─────────────────────────────────────────────┘
```

## 🚀 Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **AI Models:** Mistral AI (4 models via official SDK)
- **Voice:** ElevenLabs (Flash v2.5), Web Speech API
- **Audio:** Web Audio API for real-time visualization
- **Deploy:** Vercel
- **Dev Tool:** Built with Mistral Vibe CLI

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

- **Global Winner** — Full Mistral ecosystem usage + autonomous agent
- **Best Use of ElevenLabs** — Sentence-streaming TTS with audio-reactive UI
- **Best Use of Agent Skills** — 12 tools with autonomous multi-step planning
- **Best Vibe Usage** — Project developed with Mistral Vibe CLI
- **Hackathon's Next Unicorns** — Voice AI OS with commercial potential

## 👥 Team

**MiMi Tech AI** — Michael Bemler & Michael Soppa

- 🌐 [mimitechai.com](https://mimitechai.com)
- 🐙 [github.com/MimiTechAi](https://github.com/MimiTechAi)

## 📄 License

MIT

---

*Built with ❤️ at the Mistral AI Worldwide Hackathon 2026*
