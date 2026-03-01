# MISSI — Mistral Intelligent System for Seamless Interaction

## 🎯 What is MISSI?

MISSI is a **voice-first AI operating system** that transforms how you interact with AI. Think Siri meets ChatGPT — but powered entirely by Mistral's model ecosystem.

Say **"Hey MISSI"** and she wakes up. Ask her anything — she'll search the web, check your weather, analyze your stocks, read your emails, check your calendar, write code, create reports, translate in 10 languages — all with natural voice conversation and intelligent barge-in.

**Live Demo:** https://jarvis-eta-smoky.vercel.app

## 🏗️ Architecture

```
Voice Input → Voxtral STT → Intelligent Model Router → Tool Execution → Streaming Response → ElevenLabs TTS
                                    ↓
                    ┌─────────────────────────────────────┐
                    │  mistral-small (fast queries)       │
                    │  mistral-large (deep reasoning)     │
                    │  codestral (code generation)        │
                    │  pixtral-large (vision/images)      │
                    └─────────────────────────────────────┘
                                    ↓
                    ┌─────────────────────────────────────┐
                    │  25 Built-in Tools                  │
                    │  + 10,000+ via Composio             │
                    │  (Gmail, Calendar, GitHub, Slack...) │
                    └─────────────────────────────────────┘
```

## 🔥 Key Differentiators

### 1. Voice-First with Barge-In
Real-time bidirectional voice conversation. Start talking while MISSI is speaking — she'll stop and listen immediately. Just like talking to a real person.

### 2. Intelligent 4-Model Routing
Every query is automatically routed to the optimal Mistral model:
- **Mistral Small** → Fast answers (weather, time, definitions)
- **Mistral Large** → Complex reasoning (analysis, research, strategy)
- **Codestral** → Code generation and execution
- **Pixtral Large** → Vision analysis (drag & drop images)

### 3. 10,000+ Tool Integrations
25 built-in tools (web search, weather, stocks, crypto, code execution, document creation, translation...) PLUS 10,000+ external integrations via Composio — Gmail, Google Calendar, GitHub, Slack, Notion, and more. One-click OAuth connection.

### 4. Multi-Language Native
Speaks and understands 10 languages natively. Automatic language detection — speak German, get German answers with German voice. Powered by Voxtral STT + ElevenLabs multilingual TTS.

### 5. Autonomous Multi-Step Agent
Complex queries trigger automatic planning: MISSI creates an execution plan, chains tools intelligently (search → read → analyze → create document), and streams results in real-time with live tool activity cards.

## 🛠️ Mistral API Usage

| API | Model | Purpose |
|---|---|---|
| Chat Completions | mistral-small-latest | Fast queries, planning, suggestions |
| Chat Completions | mistral-large-latest | Deep reasoning, analysis |
| Chat Completions | codestral-latest | Code generation |
| Chat Completions | pixtral-large-latest | Vision/image analysis |
| Audio Transcriptions | voxtral-mini-latest | Speech-to-Text |
| Conversations API | mistral-large-latest | Native web search with citations |
| Function Calling | All models | 25 custom tools |

## 🎨 UX Features

- **PWA** — Installable on any device
- **Adaptive streaming** — Punctuation-aware pacing for natural reading
- **Skeleton loading** — Shimmer placeholders while thinking
- **Live tool cards** — See tools executing in real-time
- **Source citations** — Perplexity-style source cards
- **Artifact panel** — Claude-style document viewer
- **Wake word** — "Hey MISSI" activates voice mode
- **6 voices** — Switch MISSI's voice mid-conversation
- **Sound effects** — Subtle audio feedback
- **Dark mode ready** — Clean white UI with orange accents

## 👥 Team

**MiMi Tech AI** — Michael Bemler & Michael Soppa
- AI Strategy & Consulting, Digital Twins, Process Automation
- NVIDIA Connect Program member
- Based in Black Forest, Germany 🇩🇪

## 🔗 Links

- **Live:** https://jarvis-eta-smoky.vercel.app
- **GitHub:** https://github.com/MimiTechAi/missi
- **Website:** https://mimitechai.com
