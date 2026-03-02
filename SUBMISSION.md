# MISSI — Hackathon Submission

## Project Name
MISSI — Mistral Intelligent Super System Interface

## One-Liner
A voice-first AI operating system that intelligently routes queries across 6 specialized Mistral models, executes 28 autonomous tools, and speaks back naturally in 10 languages.

## Live Demo
https://jarvis-eta-smoky.vercel.app

## GitHub
https://github.com/MimiTechAi/missi

## Description (for Submission Form)

MISSI is a **voice-first AI operating system** — not just a chatbot, but a fully autonomous agent that thinks, acts, and speaks.

### What makes MISSI unique:

**🧠 6-Model Intelligent Routing** — MISSI analyzes every query and automatically selects the optimal Mistral model: Large for deep analysis, Small for speed, Magistral for reasoning & math, Medium for creative writing, Codestral for code, and Pixtral for vision. No other hackathon project uses the full Mistral model ecosystem this way.

**🎙️ True Voice-First Experience** — Powered by Voxtral Small (Mistral-native STT) and ElevenLabs TTS, MISSI enables natural continuous conversation in 10 languages (DE, EN, FR, ES, IT, PT, JA, KO, ZH, RU). The entire UI auto-localizes based on your browser language.

**🛠️ 28 Autonomous Tools** — From web search and real-time stock/crypto prices to Gmail, Google Calendar, GitHub integration, document generation, chart creation, and OCR — MISSI plans multi-step workflows and executes up to 8 rounds of tool calls autonomously.

**🔗 10,000+ Integrations** — Via Composio's V3 Tool Router Session API, MISSI connects to Gmail, Google Calendar, GitHub, Slack, Notion, Google Drive, and thousands more with managed OAuth.

**📄 Professional Output** — Documents are generated as styled HTML with data tables, metric cards, charts, and branded headers. Charts use custom SVG rendering with gradient fills and grid lines.

**👁️ Multimodal** — Drag & drop images for instant analysis via Pixtral Large. Analyze documents via Mistral OCR.

### Technical Highlights:
- Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Mistral AI SDK 1.14.1 with SSE streaming
- Custom intelligent model router (not hardcoded — real-time query analysis)
- Autonomous planning engine with up to 8 execution rounds
- Canvas panel for document rendering (iframe sandboxed)
- Full i18n across 10 languages

### Mistral Models Used:
1. `mistral-large-latest` — General intelligence
2. `mistral-small-latest` — Fast responses
3. `magistral-medium-latest` — Deep reasoning
4. `mistral-medium-latest` — Creative writing
5. `codestral-latest` — Code generation
6. `pixtral-large-latest` — Vision
7. `voxtral-small-latest` — Speech-to-text
8. `mistral-ocr-latest` — Document OCR

### Hackathon Categories:
- 🌍 **Global Winner** — Full Mistral ecosystem utilization
- 🎙️ **Best Voice Use Case (ElevenLabs)** — Continuous multilingual voice conversation
- 🤖 **Best Use of Agent Skills** — 28 tools with autonomous multi-step planning
- 🔗 **Best Integration (Composio)** — Gmail, Calendar, GitHub + 10,000+ tools

### Team
**MiMi Tech AI** — Michael Bemler & Michael Soppa
🌐 mimitechai.com · 🐙 github.com/MimiTechAi

---

## Short Description (if character-limited)

MISSI — Voice-first AI OS with 6 Mistral models (Large, Small, Magistral, Medium, Codestral, Pixtral), 28 autonomous tools, 10,000+ integrations via Composio, ElevenLabs voice in 10 languages, and professional document/chart generation. Speak naturally, MISSI plans & executes autonomously.
