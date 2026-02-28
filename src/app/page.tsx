"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import VoiceOrb from "@/components/VoiceOrb";
import ReactMarkdown from "react-markdown";

// ============================================================
// Types
// ============================================================
type ToolResult = {
  tool: string;
  args: Record<string, string>;
  result: string;
  duration: number;
};

type Source = {
  url: string;
  title: string;
  favicon: string;
  domain: string;
};

type Document = {
  title: string;
  content: string;
  type: string;
};

type ModelRoute = {
  model: string;
  label: string;
  reason: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolResult[];
  model?: ModelRoute;
  plan?: string[];
  documents?: Document[];
  sources?: Source[];
  image?: string;
  timestamp?: number;
  displayedContent?: string;
  responseTime?: number; // ms from send to response
  fromVoice?: boolean; // true if input came from STT
};

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

// ============================================================
// Persistence
// ============================================================
const STORAGE_KEY = "missi-history-v2";
function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    // Strip displayedContent on load — it's a transient animation field
    return JSON.parse(saved).map((m: Message) => {
      const { displayedContent, ...rest } = m;
      return rest;
    });
  } catch { return []; }
}
function saveMessages(msgs: Message[]) {
  // Don't persist displayedContent — it's transient
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50).map(m => {
    const { displayedContent, ...rest } = m;
    return rest;
  }))); } catch {}
}

// ============================================================
// Typing Hook
// ============================================================
function useTypingEffect(text: string, speed: number = 18, enabled: boolean = true): string {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (!enabled) { setDisplayed(text); return; }
    setDisplayed("");
    indexRef.current = 0;

    const interval = setInterval(() => {
      indexRef.current += 1;
      // Type faster — 3 chars at a time for natural feel
      const chars = Math.min(3, text.length - indexRef.current);
      indexRef.current += chars;
      
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        clearInterval(interval);
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, enabled]);

  return displayed;
}

// ============================================================
// Source Extraction — Perplexity-style source cards
// ============================================================
function extractSources(toolResults: ToolResult[]): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  for (const t of toolResults) {
    if (t.tool === "web_search" && t.result) {
      // Extract URLs from search results
      const urlMatches = t.result.match(/🔗\s*(https?:\/\/[^\s]+)/g);
      if (urlMatches) {
        for (const match of urlMatches) {
          const url = match.replace(/🔗\s*/, "").trim();
          try {
            const parsed = new URL(url);
            const domain = parsed.hostname.replace("www.", "");
            if (!seen.has(domain)) {
              seen.add(domain);
              // Extract title from the line above the URL
              const lines = t.result.split("\n");
              let title = domain;
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(url) && i > 0) {
                  title = lines[i - 1]?.replace(/^[•\-\s]+/, "").trim() || domain;
                  // Also check 2 lines up for the actual title
                  if (title.length < 5 && i > 1) {
                    title = lines[i - 2]?.replace(/^[•\-\s]+/, "").trim() || domain;
                  }
                  break;
                }
              }
              sources.push({
                url,
                title: title.slice(0, 60),
                favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                domain,
              });
            }
          } catch {}
        }
      }
    }

    if (t.tool === "read_webpage" && t.args.url) {
      const url = t.args.url;
      try {
        const parsed = new URL(url);
        const domain = parsed.hostname.replace("www.", "");
        if (!seen.has(domain)) {
          seen.add(domain);
          sources.push({
            url,
            title: domain.charAt(0).toUpperCase() + domain.slice(1),
            favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
            domain,
          });
        }
      } catch {}
    }

    if (t.tool === "wikipedia" && t.result) {
      const wikiUrlMatch = t.result.match(/Source:\s*(https:\/\/[^\s]+wikipedia[^\s]+)/);
      if (wikiUrlMatch) {
        const url = wikiUrlMatch[1];
        if (!seen.has("wikipedia")) {
          seen.add("wikipedia");
          const titleMatch = t.result.match(/📖\s*(.+)/);
          sources.push({
            url,
            title: titleMatch?.[1]?.slice(0, 50) || "Wikipedia",
            favicon: "https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32",
            domain: "wikipedia.org",
          });
        }
      }
    }
  }

  return sources.slice(0, 8); // Max 8 sources
}

// ============================================================
// Main Component
// ============================================================
export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [continuousMode, setContinuousMode] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [currentModel, setCurrentModel] = useState<ModelRoute | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [latestContent, setLatestContent] = useState("");
  const [spokenSoFar, setSpokenSoFar] = useState(""); // Syncs with TTS playback
  const [thinkingStatus, setThinkingStatus] = useState(""); // Live tool progress
  const [activeTools, setActiveTools] = useState<{ tool: string; args: Record<string, string>; status: "running" | "done"; result?: string; duration?: number }[]>([]); // Live streaming tools
  const [browsingActivities, setBrowsingActivities] = useState<{ url: string; domain: string; status: "loading" | "reading" | "done"; content?: string }[]>([]);
  const [showBrowsingPanel, setShowBrowsingPanel] = useState(true);
  // Permission-gated services
  const [permissions, setPermissions] = useState<{
    gmailToken: string | null;
    folderFiles: string[] | null;
  }>({ gmailToken: null, folderFiles: null });
  const [sttLang, setSttLang] = useState("en-US");
  
  // Auto-detect browser language on mount
  useEffect(() => {
    const browserLang = navigator.language || "en-US";
    // Map common browser langs to STT-compatible codes
    const langMap: Record<string, string> = {
      "de": "de-DE", "de-DE": "de-DE", "de-AT": "de-AT", "de-CH": "de-CH",
      "fr": "fr-FR", "fr-FR": "fr-FR",
      "es": "es-ES", "es-ES": "es-ES",
      "ja": "ja-JP", "ja-JP": "ja-JP",
      "zh": "zh-CN", "zh-CN": "zh-CN",
      "ko": "ko-KR", "ko-KR": "ko-KR",
      "pt": "pt-BR", "pt-BR": "pt-BR",
      "it": "it-IT", "it-IT": "it-IT",
      "en": "en-US", "en-US": "en-US", "en-GB": "en-GB",
    };
    const detected = langMap[browserLang] || langMap[browserLang.split("-")[0]] || "en-US";
    setSttLang(detected);
  }, []);
  
  // Keep ref in sync for callbacks
  useEffect(() => { sttLangRef.current = sttLang; }, [sttLang]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelAnimRef = useRef<number>(0);
  const shouldRelistenRef = useRef(false);
  const connectedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sttLangRef = useRef("en-US");
  const sendMessageRef = useRef<(text: string, image?: string, fromVoice?: boolean) => Promise<void>>(undefined);
  const startListeningRef = useRef<() => void>(undefined);
  const bargeInStreamRef = useRef<MediaStream | null>(null);
  const bargeInCtxRef = useRef<AudioContext | null>(null);
  const bargeInAnimRef = useRef<number>(0);

  // Typing animation for latest assistant message (orb view)
  const typedContent = useTypingEffect(latestContent, 12, latestContent.length > 0);

  // Load messages on mount
  useEffect(() => { setMessages(loadMessages()); }, []);
  useEffect(() => { if (messages.length > 0) saveMessages(messages); }, [messages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Space to start/stop listening (when not typing)
      if (e.code === "Space" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        if (voiceState === "idle" && !continuousMode) activate();
        else if (voiceState === "idle" && continuousMode) startListeningRef.current?.();
        else if (voiceState === "listening") {
          recognitionRef.current?.stop();
        } else if (voiceState === "speaking") {
          // Barge-in: interrupt speech and start listening
          if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
          speechSynthesis.cancel();
          setAudioLevel(0);
          startListeningRef.current?.();
        }
      }
      // Escape to interrupt / deactivate
      if (e.code === "Escape") {
        deactivate();
      }
      // Cmd/Ctrl+K to focus input
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState]);

  // Audio level monitoring
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handlePlay = () => {
      if (connectedRef.current) {
        const analyser = analyserRef.current;
        if (analyser) {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (audio.paused) { setAudioLevel(0); return; }
            analyser.getByteFrequencyData(dataArray);
            setAudioLevel((dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255) * 2.5);
            audioLevelAnimRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
        return;
      }
      connectedRef.current = true;
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      const ctx = audioContextRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (audio.paused) { setAudioLevel(0); return; }
        analyser.getByteFrequencyData(dataArray);
        setAudioLevel((dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255) * 2.5);
        audioLevelAnimRef.current = requestAnimationFrame(tick);
      };
      tick();
    };
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("ended", () => setAudioLevel(0));
    return () => audio.removeEventListener("play", handlePlay);
  }, []);

  // TTS — synchronized text + speech display
  const speakText = useCallback(async (text: string, messageIndex?: number) => {
    // Strip markdown for TTS — remove **, ##, `, - list markers, etc.
    const ttsText = text
      .replace(/#{1,6}\s*/g, "")          // headers
      .replace(/\*\*([^*]+)\*\*/g, "$1")  // bold
      .replace(/\*([^*]+)\*/g, "$1")      // italic
      .replace(/`([^`]+)`/g, "$1")        // inline code
      .replace(/```[\s\S]*?```/g, "")     // code blocks
      .replace(/^\s*[-*]\s/gm, "")        // bullet points
      .replace(/^\s*\d+\.\s/gm, "")       // numbered lists
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
      .replace(/\n{2,}/g, ". ")           // double newlines → pause
      .trim();
    
    const sentences = ttsText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [ttsText];
    
    // Group sentences in pairs for natural speech flow
    const chunks: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      const group = sentences.slice(i, i + 2).map(s => s.trim()).filter(s => s.length > 1).join(" ");
      if (group) chunks.push(group);
    }
    
    setVoiceState("speaking");
    setSpokenSoFar(""); // Reset
    let accumulated = "";
    
    for (const chunk of chunks) {
      // Reveal this chunk's text BEFORE audio plays (like subtitles appearing)
      accumulated += (accumulated ? " " : "") + chunk;
      setSpokenSoFar(accumulated);
      
      // Update the message in-place so chat panel shows progressive text
      if (messageIndex !== undefined) {
        setMessages(prev => {
          const updated = [...prev];
          if (updated[messageIndex]) {
            updated[messageIndex] = { ...updated[messageIndex], displayedContent: accumulated };
          }
          return updated;
        });
      }
      
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, language: sttLangRef.current, voiceId: currentVoiceId }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          await new Promise<void>((resolve) => {
            if (audioRef.current) {
              audioRef.current.src = url;
              audioRef.current.onended = () => { URL.revokeObjectURL(url); resolve(); };
              audioRef.current.onerror = () => { URL.revokeObjectURL(url); resolve(); };
              audioRef.current.onpause = () => { URL.revokeObjectURL(url); resolve(); }; // Barge-in: resolve on pause so speakText exits cleanly
              audioRef.current.play().catch(() => resolve());
            } else resolve();
          });
          // If barge-in interrupted, stop speaking remaining chunks
          if (audioRef.current?.paused && audioRef.current?.currentTime === 0) {
            break; // Exit chunk loop — user is talking
          }
        } else {
          // ElevenLabs failed (quota, auth, etc) — use browser TTS fallback
          await new Promise<void>((resolve) => {
            const u = new SpeechSynthesisUtterance(chunk);
            u.lang = sttLangRef.current;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            speechSynthesis.speak(u);
          });
        }
      } catch {
        // Network error — use browser TTS fallback
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(chunk);
          u.lang = sttLangRef.current;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          speechSynthesis.speak(u);
        });
      }
    }
    
    // Reveal full text at the end
    setSpokenSoFar(text);
    if (messageIndex !== undefined) {
      setMessages(prev => {
        const updated = [...prev];
        if (updated[messageIndex]) {
          updated[messageIndex] = { ...updated[messageIndex], displayedContent: text };
        }
        return updated;
      });
    }
    
    setVoiceState("idle");
    setAudioLevel(0);
    if (shouldRelistenRef.current && startListeningRef.current) {
      setTimeout(() => startListeningRef.current?.(), 400);
    }
  }, []); // No deps needed — uses refs

  // Image to base64
  const imageToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Send message
  const sendMessage = useCallback(async (text: string, imageData?: string, fromVoice?: boolean) => {
    if (!text.trim() && !imageData) return;
    const userMessage: Message = { role: "user", content: text, image: imageData, timestamp: Date.now(), fromVoice: !!fromVoice };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setVoiceState("thinking");
    setShowChat(true);
    setCurrentModel(null);
    setCurrentPlan(null);
    setLatestContent("");
    setThinkingStatus("");

    // Filler audio — speak a brief acknowledgment while LLM is thinking
    const fillers: Record<string, string[]> = {
      "de": ["Moment...", "Einen Augenblick...", "Lass mich nachsehen..."],
      "fr": ["Un instant...", "Laissez-moi vérifier..."],
      "es": ["Un momento...", "Déjame revisar..."],
      "en": ["Let me check...", "One moment...", "Looking into that..."],
    };
    const langKey = sttLangRef.current.split("-")[0];
    const fillerList = fillers[langKey] || fillers["en"];
    const filler = fillerList[Math.floor(Math.random() * fillerList.length)];
    
    // Fire filler TTS (don't await — let it play while API call runs)
    const fillerPromise = (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: filler, language: sttLangRef.current, voiceId: currentVoiceIdRef.current }),
        });
        if (res.ok && audioRef.current) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          audioRef.current.src = url;
          audioRef.current.onended = () => URL.revokeObjectURL(url);
          await audioRef.current.play().catch(() => {});
        } else if (!res.ok) {
          // ElevenLabs quota/error — browser TTS fallback
          const u = new SpeechSynthesisUtterance(filler);
          u.lang = sttLangRef.current;
          speechSynthesis.speak(u);
        }
      } catch {}
    })();

    try {
      const chatMessages = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));
      
      // API call runs IN PARALLEL with filler audio
      const apiStart = Date.now();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages,
          image: imageData || undefined,
          permissions: {
            gmailToken: permissions.gmailToken || undefined,
            fileIndex: permissions.folderFiles?.join("\n") || undefined,
            location: userLocation || undefined,
          },
        }),
      });

      // ── SSE Stream Reader ──
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedContent = "";
      let streamedModel: ModelRoute | null = null;
      let streamedPlan: string[] | null = null;
      let streamedToolResults: ToolResult[] = [];
      let streamedDocuments: Document[] = [];
      const activeTools: { tool: string; args: Record<string, string>; status: "running" | "done"; result?: string; duration?: number }[] = [];

      // Live tool cards state
      setActiveTools([]);
      setBrowsingActivities([]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          const eventMatch = eventBlock.match(/^event: (.+)$/m);
          const dataMatch = eventBlock.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const eventType = eventMatch[1];
          let eventData;
          try { eventData = JSON.parse(dataMatch[1]); } catch { continue; }

          switch (eventType) {
            case "model_selected":
              streamedModel = eventData;
              setCurrentModel(eventData);
              break;

            case "plan":
              streamedPlan = eventData;
              setCurrentPlan(eventData);
              break;

            case "status":
              setThinkingStatus(String(eventData));
              break;

            case "tool_start": {
              const toolEntry = { tool: eventData.tool, args: eventData.args, status: "running" as const };
              activeTools.push(toolEntry);
              setActiveTools([...activeTools]);
              // Track browsing activities for live panel
              if (eventData.tool === "read_webpage" && eventData.args.url) {
                try {
                  const domain = new URL(eventData.args.url).hostname.replace("www.", "");
                  setBrowsingActivities(prev => [...prev, { url: eventData.args.url, domain, status: "loading" }]);
                  setShowBrowsingPanel(true);
                } catch {}
              }
              if (eventData.tool === "web_search") {
                setBrowsingActivities(prev => [...prev, { url: `search://${eventData.args.query}`, domain: "DuckDuckGo", status: "loading" }]);
                setShowBrowsingPanel(true);
              }
              // Live thinking status
              const toolStatusIcons: Record<string, string> = {
                web_search: "🔍 Searching the web", get_weather: "🌤️ Checking weather",
                get_time: "🕐 Getting time", calculate: "🔢 Calculating",
                run_code: "💻 Running code", read_webpage: "📄 Reading webpage",
                create_document: "📝 Creating document", translate: "🌐 Translating",
                analyze_data: "📊 Analyzing data", generate_code: "⌨️ Generating code",
                set_reminder: "⏰ Setting reminder", summarize_text: "📋 Summarizing",
                search_gmail: "📧 Searching Gmail", read_gmail: "📧 Reading email", search_files: "📂 Searching files",
                get_calendar: "📅 Checking calendar", get_stock_price: "📈 Fetching stock price",
                get_crypto_price: "🪙 Fetching crypto price", wikipedia: "📖 Searching Wikipedia",
                get_location: "📍 Getting location", change_voice: "🎭 Changing voice",
                news_headlines: "📰 Fetching headlines", unit_convert: "🔄 Converting",
                define_word: "📖 Looking up definition", random_fact: "💡 Generating fact",
              };
              const argPreview = formatToolArgs(eventData.tool, eventData.args);
              setThinkingStatus(`${toolStatusIcons[eventData.tool] || eventData.tool}${argPreview ? `: ${argPreview}` : ""}...`);
              break;
            }

            case "tool_result": {
              // Mark tool as done
              const idx = activeTools.findIndex(t => t.tool === eventData.tool && t.status === "running");
              if (idx >= 0) {
                activeTools[idx] = { ...activeTools[idx], status: "done", result: eventData.result, duration: eventData.duration };
                setActiveTools([...activeTools]);
              }
              // Update browsing panel
              if (eventData.tool === "read_webpage" || eventData.tool === "web_search") {
                setBrowsingActivities(prev => {
                  const updated = [...prev];
                  const lastLoading = updated.findLastIndex(b => b.status === "loading");
                  if (lastLoading >= 0) {
                    updated[lastLoading] = { ...updated[lastLoading], status: "done", content: eventData.result?.slice(0, 200) };
                  }
                  return updated;
                });
              }
              streamedToolResults.push(eventData);
              // Handle special tool results
              if (eventData.tool === "change_voice") {
                try {
                  const voiceData = JSON.parse(eventData.result);
                  if (voiceData._type === "voice_change") {
                    setCurrentVoiceId(voiceData.voiceId);
                  }
                } catch {}
              }
              if (eventData.tool === "set_reminder") {
                try {
                  const reminderData = JSON.parse(eventData.result);
                  if (reminderData._type === "reminder") {
                    scheduleReminder(reminderData.message, 60000); // Default 1 min
                  }
                } catch {}
              }
              playSound("success");
              break;
            }

            case "content_delta": {
              // Streaming text — append chunk to content
              const chunk = String(eventData);
              streamedContent += chunk;
              setLatestContent(streamedContent);
              // Also show streaming text in the messages area as a live preview
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && last?.displayedContent !== undefined) {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...last, content: streamedContent, displayedContent: streamedContent };
                  return updated;
                }
                // First delta — create a new streaming message
                return [...prev, {
                  role: "assistant" as const,
                  content: streamedContent,
                  displayedContent: streamedContent,
                  timestamp: Date.now(),
                }];
              });
              break;
            }

            case "content_done": {
              // Streaming complete — finalize content
              streamedContent = String(eventData);
              setLatestContent(streamedContent);
              break;
            }

            case "content":
              streamedContent = String(eventData);
              setLatestContent(streamedContent);
              break;

            case "done":
              if (eventData.documents) streamedDocuments = eventData.documents;
              if (eventData.model) streamedModel = eventData.model;
              break;

            case "error":
              setMessages(prev => [...prev, { role: "assistant", content: `Error: ${eventData.message}`, timestamp: Date.now() }]);
              setVoiceState("idle");
              setIsLoading(false);
              return;
          }
        }
      }

      // Stop filler audio
      await fillerPromise;
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      if (!streamedContent) {
        setVoiceState("idle");
      } else {
        const responseTime = Date.now() - apiStart;
        const sources = extractSources(streamedToolResults);
        const finalMsg: Message = {
          role: "assistant",
          content: streamedContent,
          displayedContent: streamedContent,
          toolCalls: streamedToolResults.length > 0 ? streamedToolResults : undefined,
          model: streamedModel || undefined,
          plan: streamedPlan || undefined,
          documents: streamedDocuments,
          sources: sources.length > 0 ? sources : undefined,
          timestamp: Date.now(),
          responseTime,
        };

        setActiveTools([]);
        setBrowsingActivities([]);
        let msgIndex = 0;
        setMessages(prev => {
          // Check if streaming already created a message (last msg is assistant with same content)
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last?.displayedContent !== undefined) {
            // Update existing streaming message with full metadata
            const updated = [...prev];
            msgIndex = updated.length - 1;
            updated[msgIndex] = finalMsg;
            return updated;
          }
          // No streaming message exists — create new
          msgIndex = prev.length;
          return [...prev, finalMsg];
        });
        setIsLoading(false);

        await speakText(streamedContent, msgIndex);
      }
      setActiveTools([]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection lost. Please try again.", timestamp: Date.now() }]);
      setVoiceState("idle");
    } finally { setIsLoading(false); }
  }, [messages, speakText]);

  // Keep ref in sync
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ============================================================
  // Voxtral STT — Mistral-native Speech-to-Text
  // Records via MediaRecorder, detects silence via AudioContext,
  // sends audio to /api/stt (Voxtral) for transcription
  // ============================================================
  const startListening = useCallback(() => {
    // Interrupt any playing audio
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      speechSynthesis.cancel();
      setAudioLevel(0);
    }

    setVoiceState("listening");
    setInput("");

    let mediaRecorder: MediaRecorder | null = null;
    let audioChunks: Blob[] = [];
    let audioCtx: AudioContext | null = null;
    let analyserNode: AnalyserNode | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasSpeech = false;
    let silenceStart = 0;
    let animFrame = 0;
    const SILENCE_THRESHOLD = 0.015; // RMS below this = silence
    const SILENCE_DURATION = 1200; // ms of silence before sending
    let stopped = false;

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 512;
        source.connect(analyserNode);
        const dataArray = new Float32Array(analyserNode.fftSize);

        mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          if (audioCtx) audioCtx.close();
          cancelAnimationFrame(animFrame);

          if (!hasSpeech || audioChunks.length === 0) {
            // No speech detected — relisten or idle
            if (shouldRelistenRef.current && !stopped) {
              setTimeout(() => startListeningRef.current?.(), 500);
            } else {
              setVoiceState("idle");
            }
            return;
          }

          // Show "transcribing" state
          setInput("🎙️ Transcribing with Voxtral...");
          setVoiceState("thinking");

          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", audioBlob);
          // Map STT language code to ISO 639-1
          const lang = sttLangRef.current?.split("-")[0] || "en";
          formData.append("language", lang);

          try {
            const res = await fetch("/api/stt", { method: "POST", body: formData });
            if (!res.ok) throw new Error(`STT ${res.status}`);
            const data = await res.json();
            const text = (data.text || "").trim();
            if (text) {
              setInput(text);
              sendMessageRef.current?.(text, undefined, true);
            } else {
              // Empty transcription — relisten
              if (shouldRelistenRef.current && !stopped) {
                setTimeout(() => startListeningRef.current?.(), 300);
              } else {
                setVoiceState("idle");
                setInput("");
              }
            }
          } catch (err) {
            console.error("Voxtral STT failed, falling back to browser:", err);
            // Fallback: try browser SpeechRecognition
            fallbackBrowserSTT();
          }
        };

        // Monitor audio levels for silence detection
        const checkAudio = () => {
          if (!analyserNode || stopped) return;
          analyserNode.getFloatTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
          const rms = Math.sqrt(sum / dataArray.length);

          if (rms > SILENCE_THRESHOLD) {
            hasSpeech = true;
            silenceStart = 0;
            if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
          } else if (hasSpeech) {
            if (!silenceStart) silenceStart = Date.now();
            if (Date.now() - silenceStart > SILENCE_DURATION && !silenceTimer) {
              silenceTimer = setTimeout(() => {
                if (mediaRecorder?.state === "recording") {
                  mediaRecorder.stop();
                }
              }, 50);
            }
          }
          animFrame = requestAnimationFrame(checkAudio);
        };

        mediaRecorder.start(250); // collect in 250ms chunks
        checkAudio();

        // Store reference for external stop
        recognitionRef.current = {
          stop: () => {
            stopped = true;
            if (mediaRecorder?.state === "recording") mediaRecorder.stop();
            else {
              stream.getTracks().forEach(t => t.stop());
              if (audioCtx) audioCtx.close();
              cancelAnimationFrame(animFrame);
            }
          }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      })
      .catch((err) => {
        console.error("Mic access denied:", err);
        setVoiceState("idle");
        alert("Microphone access is required for voice input.");
      });

    // Browser STT fallback (used if Voxtral fails)
    function fallbackBrowserSTT() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { setVoiceState("idle"); return; }
      const recog = new SR();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = sttLangRef.current;
      let ft = "";
      recog.onresult = (event: { results: { isFinal: boolean; 0: { transcript: string } }[]; length?: number }) => {
        ft = "";
        for (let i = 0; i < (event.results?.length || 0); i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = (event as any).results[i];
          if (r.isFinal) ft += r[0].transcript;
        }
        setInput(ft);
      };
      recog.onend = () => {
        if (ft.trim()) sendMessageRef.current?.(ft.trim(), undefined, true);
        else if (shouldRelistenRef.current) setTimeout(() => startListeningRef.current?.(), 500);
        else setVoiceState("idle");
      };
      recog.onerror = () => { setVoiceState("idle"); };
      setVoiceState("listening");
      recog.start();
      recognitionRef.current = recog;
    }
  }, []); // No deps — uses refs for everything

  // Keep ref in sync
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // Activate = start continuous conversation with greeting
  const activate = useCallback(() => {
    setContinuousMode(true);
    shouldRelistenRef.current = true;
    
    // Welcome greeting based on detected language
    const greetings: Record<string, string> = {
      "de-DE": "Hallo! Ich bin Missi. Wie kann ich dir helfen?",
      "de-AT": "Hallo! Ich bin Missi. Wie kann ich dir helfen?",
      "de-CH": "Hallo! Ich bin Missi. Wie kann ich dir helfen?",
      "fr-FR": "Bonjour! Je suis Missi. Comment puis-je vous aider?",
      "es-ES": "¡Hola! Soy Missi. ¿En qué puedo ayudarte?",
      "ja-JP": "こんにちは！ミッシーです。何かお手伝いできますか？",
      "zh-CN": "你好！我是Missi。有什么可以帮助你的？",
      "en-US": "Hello! I'm Missi, your AI assistant. How can I help you?",
      "en-GB": "Hello! I'm Missi, your AI assistant. How can I help you?",
    };
    const greeting = greetings[sttLangRef.current] || greetings["en-US"];
    
    // Speak greeting, then start listening
    (async () => {
      setVoiceState("speaking");
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: greeting, language: sttLangRef.current, voiceId: currentVoiceIdRef.current }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          await new Promise<void>((resolve) => {
            if (audioRef.current) {
              audioRef.current.src = url;
              audioRef.current.onended = () => { URL.revokeObjectURL(url); resolve(); };
              audioRef.current.onerror = () => { URL.revokeObjectURL(url); resolve(); };
              audioRef.current.play().catch(() => resolve());
            } else resolve();
          });
        } else {
          // ElevenLabs unavailable — browser TTS fallback for greeting
          await new Promise<void>((resolve) => {
            const u = new SpeechSynthesisUtterance(greeting);
            u.lang = sttLangRef.current;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            speechSynthesis.speak(u);
          });
        }
      } catch {
        // Network error — browser TTS fallback
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(greeting);
          u.lang = sttLangRef.current;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          speechSynthesis.speak(u);
        });
      }
      setVoiceState("idle");
      setAudioLevel(0);
      startListening();
    })();
  }, [startListening]);

  // Deactivate = stop everything
  const deactivate = useCallback(() => {
    setContinuousMode(false);
    shouldRelistenRef.current = false;
    recognitionRef.current?.stop();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    speechSynthesis.cancel();
    setVoiceState("idle");
    setAudioLevel(0);
    setInput("");
  }, []);

  const handleOrbClick = useCallback(() => {
    if (voiceState === "idle" && !continuousMode) {
      activate();
    } else if (voiceState === "idle" && continuousMode) {
      startListening();
    } else if (voiceState === "listening") {
      if (input.trim()) {
        recognitionRef.current?.stop();
        sendMessageRef.current?.(input.trim(), undefined, true);
      } else {
        deactivate();
      }
    } else if (voiceState === "speaking") {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
      speechSynthesis.cancel();
      setAudioLevel(0);
      startListening();
    }
  }, [voiceState, continuousMode, input, activate, deactivate, startListening]);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    sendMessage(input || "Analyze this image", await imageToBase64(file));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const downloadDocument = (doc: Document) => {
    const blob = new Blob([`# ${doc.title}\n\n${doc.content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${doc.title.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click(); URL.revokeObjectURL(url);
  };

  const clearConversation = () => {
    setMessages([]); localStorage.removeItem(STORAGE_KEY);
    setShowChat(false); setCurrentModel(null); setCurrentPlan(null); setLatestContent("");
  };

  // ── Permission: Connect Folder (File System Access API) ──
  const connectFolder = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      const fileList: string[] = [];
      async function scanDir(handle: FileSystemDirectoryHandle, path: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const entry of (handle as any).values()) {
          if (entry.kind === "file") {
            fileList.push(`${path}/${entry.name}`);
          } else if (entry.kind === "directory" && !entry.name.startsWith(".")) {
            await scanDir(entry, `${path}/${entry.name}`);
          }
        }
      }
      await scanDir(dirHandle, dirHandle.name);
      setPermissions(prev => ({ ...prev, folderFiles: fileList }));
    } catch {
      // User cancelled
    }
  }, []);

  // ── Permission: Connect Gmail (OAuth2 popup) ──
  const connectGmail = useCallback(() => {
    const popup = window.open("/api/auth/gmail", "gmail_auth", "width=500,height=600");
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === "gmail_auth" && event.data.code) {
        window.removeEventListener("message", handler);
        popup?.close();
        // Exchange code for token
        try {
          const res = await fetch("/api/auth/gmail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: event.data.code }),
          });
          const data = await res.json();
          if (data.access_token) {
            setPermissions(prev => ({ ...prev, gmailToken: data.access_token }));
          }
        } catch {}
      }
    };
    window.addEventListener("message", handler);
  }, []);

  // ── Sound Effects (Web Audio API) ──
  const playSound = useCallback((type: "activate" | "success" | "error") => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.08;
      if (type === "activate") { osc.frequency.value = 880; gain.gain.value = 0.06; }
      else if (type === "success") { osc.frequency.value = 660; }
      else { osc.frequency.value = 220; }
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }, []);

  // ── Geolocation ──
  const [userLocation, setUserLocation] = useState<string>("");
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=&count=1&latitude=${latitude}&longitude=${longitude}`);
            const locStr = `Latitude: ${latitude.toFixed(4)}, Longitude: ${longitude.toFixed(4)}`;
            setUserLocation(locStr);
            // Reverse geocode not available via open-meteo, but coords are enough
          } catch {
            setUserLocation(`Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}`);
          }
        },
        () => {} // permission denied — that's ok
      );
    }
  }, []);

  // ── Voice Barge-In Detection (GPT-4o style) ──
  // While MISSI is speaking, monitor mic for user voice.
  // If user starts talking → interrupt playback + start listening immediately.
  useEffect(() => {
    if (voiceState !== "speaking") {
      // Cleanup when not speaking
      if (bargeInStreamRef.current) {
        bargeInStreamRef.current.getTracks().forEach(t => t.stop());
        bargeInStreamRef.current = null;
      }
      if (bargeInCtxRef.current) {
        bargeInCtxRef.current.close();
        bargeInCtxRef.current = null;
      }
      cancelAnimationFrame(bargeInAnimRef.current);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        bargeInStreamRef.current = stream;

        const ctx = new AudioContext();
        bargeInCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Float32Array(analyser.fftSize);
        const BARGE_IN_THRESHOLD = 0.04; // RMS threshold — higher than silence but catches speech
        let consecutiveFrames = 0;
        const REQUIRED_FRAMES = 4; // ~4 frames of voice = ~66ms of sustained speech

        const checkVoice = () => {
          if (cancelled) return;
          analyser.getFloatTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
          const rms = Math.sqrt(sum / dataArray.length);

          if (rms > BARGE_IN_THRESHOLD) {
            consecutiveFrames++;
            if (consecutiveFrames >= REQUIRED_FRAMES) {
              // USER IS TALKING — BARGE IN!
              console.log("[MISSI] Barge-in detected! RMS:", rms.toFixed(4));
              // Stop playback
              if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
              speechSynthesis.cancel();
              setAudioLevel(0);
              // Cleanup barge-in monitoring
              stream.getTracks().forEach(t => t.stop());
              ctx.close();
              bargeInStreamRef.current = null;
              bargeInCtxRef.current = null;
              // Start listening
              setVoiceState("idle"); // Brief reset so startListening picks up clean
              setTimeout(() => startListeningRef.current?.(), 100);
              return;
            }
          } else {
            consecutiveFrames = Math.max(0, consecutiveFrames - 1); // Decay slowly
          }

          bargeInAnimRef.current = requestAnimationFrame(checkVoice);
        };

        bargeInAnimRef.current = requestAnimationFrame(checkVoice);
      } catch (err) {
        console.warn("[MISSI] Barge-in mic access denied:", err);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(bargeInAnimRef.current);
      if (bargeInStreamRef.current) {
        bargeInStreamRef.current.getTracks().forEach(t => t.stop());
        bargeInStreamRef.current = null;
      }
      if (bargeInCtxRef.current) {
        bargeInCtxRef.current.close();
        bargeInCtxRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState]);

  // ── Wake Word Detection ("Hey Missi") ──
  const activateRef = useRef(activate);
  useEffect(() => { activateRef.current = activate; }, [activate]);
  
  useEffect(() => {
    if (continuousMode || voiceState !== "idle") return; // Already active
    if (typeof window === "undefined" || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const wakeRecog = new SpeechRecognition();
    wakeRecog.continuous = true;
    wakeRecog.interimResults = true;
    wakeRecog.lang = sttLangRef.current;

    wakeRecog.onresult = (event: { results: { transcript: string }[][] }) => {
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase();
        if (transcript.includes("hey missi") || transcript.includes("missi") || transcript.includes("hey missy") || transcript.includes("missi")) {
          wakeRecog.stop();
          playSound("activate");
          // Call activate() which speaks greeting + starts listening
          activateRef.current();
          return;
        }
      }
    };
    wakeRecog.onend = () => {
      // Restart wake word listener if still idle
      if (!continuousMode) {
        try { wakeRecog.start(); } catch {}
      }
    };
    try { wakeRecog.start(); } catch {}
    return () => { try { wakeRecog.stop(); } catch {} };
  }, [continuousMode, voiceState, playSound]);

  // ── Notification Permission + Reminder Scheduling ──
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const scheduleReminder = useCallback((message: string, delayMs: number) => {
    const reminderTimeout = setTimeout(() => {
      if (Notification.permission === "granted") {
        new Notification("🔔 MISSI Reminder", { body: message, icon: "/favicon.ico" });
      }
      playSound("success");
    }, delayMs);
    return reminderTimeout;
  }, [playSound]);

  // ── Voice Change Handler ──
  const [currentVoiceId, setCurrentVoiceId] = useState("EXAVITQu4vr4xnSDxMaL"); // Sarah (warm female) — MISSI is feminine
  const currentVoiceIdRef = useRef(currentVoiceId);
  useEffect(() => { currentVoiceIdRef.current = currentVoiceId; }, [currentVoiceId]);

  const toolIcons: Record<string, string> = {
    web_search: "🔍", get_weather: "🌤️", get_time: "🕐", calculate: "🔢",
    run_code: "💻", read_webpage: "📄", create_document: "📝", translate: "🌐",
    analyze_data: "📊", generate_code: "⌨️", set_reminder: "⏰", summarize_text: "📋",
    search_gmail: "📧", read_gmail: "📧", search_files: "📂", get_calendar: "📅",
    get_stock_price: "📈", get_crypto_price: "🪙", wikipedia: "📖", get_location: "📍", change_voice: "🎭",
    news_headlines: "📰", unit_convert: "🔄", define_word: "📖", random_fact: "💡",
  };

  // Human-readable tool args display
  const formatToolArgs = (tool: string, args: Record<string, string>) => {
    if (typeof args === "string") return args;
    switch (tool) {
      case "web_search": return `"${args.query}"`;
      case "get_weather": return args.location;
      case "get_time": return args.timezone || "UTC";
      case "calculate": return args.expression;
      case "get_stock_price": return args.symbol?.toUpperCase();
      case "get_crypto_price": return args.coin;
      case "wikipedia": return `"${args.query}"${args.lang ? ` (${args.lang})` : ""}`;
      case "translate": return `→ ${args.to}`;
      case "read_webpage": return args.url?.replace(/^https?:\/\//, "").slice(0, 40);
      case "create_document": return args.title;
      case "generate_code": return `${args.language}: ${args.description?.slice(0, 40)}`;
      case "news_headlines": return args.topic || "latest";
      case "unit_convert": return `${args.value} ${args.from} → ${args.to}`;
      case "define_word": return args.word;
      case "run_code": return args.code?.slice(0, 40) + (args.code?.length > 40 ? "…" : "");
      case "change_voice": return args.voice;
      case "set_reminder": return args.message?.slice(0, 40);
      case "summarize_text": return `${args.format || "paragraph"} (${args.max_length || "medium"})`;
      case "search_files": return `"${args.query}"`;
      case "search_gmail": return args.query;
      case "random_fact": return args.category || "random";
      default: return JSON.stringify(args).slice(0, 50);
    }
  };

  const modelColors: Record<string, string> = {
    "mistral-small-latest": "text-emerald-400",
    "mistral-large-latest": "text-violet-400",
    "codestral-latest": "text-blue-400",
    "pixtral-large-latest": "text-pink-400",
  };

  const modelIcons: Record<string, string> = {
    "mistral-small-latest": "⚡",
    "mistral-large-latest": "🧠",
    "codestral-latest": "💻",
    "pixtral-large-latest": "👁️",
  };

  // Memoized stats
  const stats = useMemo(() => {
    const totalTools = messages.reduce((s, m) => s + (m.toolCalls?.length || 0), 0);
    const models = new Set(messages.filter(m => m.model).map(m => m.model!.model));
    return { totalTools, uniqueModels: models.size };
  }, [messages]);



  return (
    <div
      className="h-screen bg-white text-zinc-900 flex overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f); }}
    >
      {/* Drop overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-blue-400 m-4 rounded-2xl">
          <div className="text-center">
            <div className="text-5xl mb-3">👁️</div>
            <p className="text-blue-600 text-base font-medium">Drop image for visual analysis</p>
            <p className="text-zinc-400 text-sm mt-1">Powered by Pixtral</p>
          </div>
        </div>
      )}

      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-[52px] flex-shrink-0 bg-zinc-50 border-r border-zinc-200 flex flex-col items-center py-3 gap-2">
        {/* Logo */}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-xs font-black text-white shadow-sm mb-1">
          M
        </div>

        {/* Nav icons */}
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors" title="Chat">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button onClick={handleOrbClick}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            voiceState !== "idle"
              ? "bg-orange-50 text-orange-500 ring-1 ring-orange-200"
              : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
          }`} title="Voice">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        </button>
        <button onClick={connectFolder}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            permissions.folderFiles && permissions.folderFiles.length > 0
              ? "bg-emerald-50 text-emerald-500 ring-1 ring-emerald-200"
              : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
          }`} title="Files">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button onClick={connectGmail}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            permissions.gmailToken
              ? "bg-emerald-50 text-emerald-500 ring-1 ring-emerald-200"
              : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
          }`} title="Gmail">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Language & clear */}
        <select value={sttLang} onChange={(e) => setSttLang(e.target.value)}
          className="w-8 h-7 bg-transparent text-zinc-400 text-[9px] cursor-pointer hover:text-zinc-600 text-center rounded-lg hover:bg-zinc-100 transition-colors border-0 outline-none appearance-none font-mono">
          {[["de-DE","DE"],["en-US","EN"],["fr-FR","FR"],["es-ES","ES"],["it-IT","IT"],["pt-BR","PT"],["ja-JP","JA"],["ko-KR","KO"],["zh-CN","ZH"],["ru-RU","RU"]].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button onClick={() => { setMessages([]); saveMessages([]); }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors" title="Clear (⌘K)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── TOP BAR ── */}
        <header className="flex-shrink-0 h-11 border-b border-zinc-100 flex items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold text-zinc-800">MISSI</span>
            <span className="text-[11px] text-zinc-400 font-medium">Powered by Mistral AI · Voxtral · ElevenLabs</span>
          </div>
          <div className="flex items-center gap-1.5">
            {currentModel && (
              <span className={`text-[11px] px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-200 font-medium ${
                currentModel.model.includes("large") ? "text-violet-600" :
                currentModel.model.includes("codestral") ? "text-emerald-600" :
                currentModel.model.includes("pixtral") ? "text-pink-600" :
                "text-amber-600"
              }`}>
                {modelIcons[currentModel.model]} {currentModel.label}
              </span>
            )}
            {stats.totalTools > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-500">
                🛠 {stats.totalTools} tool{stats.totalTools !== 1 ? "s" : ""}
              </span>
            )}
            {voiceState !== "idle" && (
              <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${
                voiceState === "listening" ? "bg-red-50 border-red-200 text-red-500" :
                voiceState === "thinking" ? "bg-amber-50 border-amber-200 text-amber-600 animate-pulse" :
                "bg-blue-50 border-blue-200 text-blue-500"
              }`}>
                {voiceState === "listening" ? "● Voxtral Listening" : voiceState === "thinking" ? "◐ Thinking" : "▶ Speaking"}
              </span>
            )}
          </div>
        </header>

        {/* ── CHAT AREA ── */}
        {messages.length === 0 && !isLoading ? (
          /* IDLE: Hero centered (like ChatGPT) */
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
            <VoiceOrb state={voiceState} audioLevel={audioLevel} size={100} onClick={handleOrbClick} />
            <h2 className="mt-6 text-[22px] font-semibold text-zinc-800 tracking-tight">What can I help with?</h2>
            <p className="mt-1.5 text-[13px] text-zinc-400">25 Tools · 4 Models · Voxtral STT · ElevenLabs TTS · Vision · Multi-Language</p>

            {voiceState === "idle" && (
              <div className="mt-8 grid grid-cols-2 gap-2.5 max-w-md w-full">
                {(() => {
                  const promptsByLang: Record<string, {icon: string; text: string}[]> = {
                    "de": [
                      {icon:"🔍", text:"Neueste KI-Durchbrüche"},
                      {icon:"🌤", text:"Wetter in Berlin"},
                      {icon:"📈", text:"Tesla & Bitcoin Preis"},
                      {icon:"🌐", text:"Übersetze in 5 Sprachen"},
                    ],
                    "en": [
                      {icon:"🔍", text:"Latest AI breakthroughs"},
                      {icon:"🌤", text:"Weather in Tokyo"},
                      {icon:"📈", text:"Tesla & Bitcoin price"},
                      {icon:"🌐", text:"Translate into 5 languages"},
                    ],
                    "fr": [
                      {icon:"🔍", text:"Avancées en IA"},
                      {icon:"🌤", text:"Météo à Paris"},
                      {icon:"📈", text:"Prix Tesla et Bitcoin"},
                      {icon:"🌐", text:"Traduire en 5 langues"},
                    ],
                    "es": [
                      {icon:"🔍", text:"Avances en IA"},
                      {icon:"🌤", text:"Tiempo en Madrid"},
                      {icon:"📈", text:"Precio Tesla y Bitcoin"},
                      {icon:"🌐", text:"Traducir a 5 idiomas"},
                    ],
                  };
                  const langKey = sttLang.split("-")[0];
                  const prompts = promptsByLang[langKey] || promptsByLang["en"];
                  return prompts.map((p) => (
                    <button key={p.text} onClick={() => sendMessage(p.text)}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 text-left transition-all duration-150 group">
                      <span className="text-lg">{p.icon}</span>
                      <span className="text-[13px] text-zinc-600 group-hover:text-zinc-900 leading-snug">{p.text}</span>
                    </button>
                  ));
                })()}
              </div>
            )}

            {input && voiceState === "listening" && (
              <p className="mt-6 text-zinc-500 text-base italic max-w-md text-center">&quot;{input}&quot;</p>
            )}
          </div>
        ) : (
          /* CHAT: Full-width messages (like ChatGPT/Perplexity) */
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="max-w-[720px] mx-auto px-5 py-6 space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* USER MESSAGE */}
                  {msg.role === "user" && (
                    <div className="flex justify-end mb-5">
                      <div className="max-w-[75%] bg-zinc-100 rounded-2xl rounded-tr-sm px-4 py-3">
                        {msg.fromVoice && (
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mb-1">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/></svg>
                            Voxtral Voice
                          </div>
                        )}
                        <p className="text-[14px] text-zinc-800 leading-relaxed">{msg.content}</p>
                        {msg.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={msg.image} alt="" className="mt-2 max-w-[220px] rounded-lg border border-zinc-200" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* AI MESSAGE — no bubble, text on white (like ChatGPT) */}
                  {msg.role === "assistant" && (
                    <div className="mb-5 group">
                      {/* Avatar + model */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-[9px] font-black text-white">M</div>
                        <span className="text-[12px] font-semibold text-zinc-700">MISSI</span>
                        {msg.model && (
                          <span className={`text-[11px] font-medium ${
                            msg.model.model.includes("large") ? "text-violet-500" :
                            msg.model.model.includes("codestral") ? "text-emerald-500" :
                            msg.model.model.includes("pixtral") ? "text-pink-500" :
                            "text-amber-500"
                          }`}>
                            {modelIcons[msg.model.model]} {msg.model.label}
                          </span>
                        )}
                        {msg.responseTime && (
                          <span className="text-[11px] text-zinc-400">· {(msg.responseTime / 1000).toFixed(1)}s</span>
                        )}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <span className="text-[11px] text-zinc-400">· {msg.toolCalls.length} tool{msg.toolCalls.length !== 1 ? "s" : ""}</span>
                        )}
                      </div>

                      {/* Plan */}
                      {msg.plan && (
                        <div className="mb-3 ml-8 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                          <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider mb-1.5">Execution Plan</p>
                          {msg.plan.map((s, j) => (
                            <div key={j} className="flex items-start gap-2 text-[13px] text-amber-700 py-0.5">
                              <span className="text-amber-400 text-[10px] mt-0.5">✓</span><span>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* RESPONSE TEXT — no bubble, clean text (like ChatGPT) */}
                      <div className="ml-8">
                        <div className="prose prose-zinc prose-sm max-w-none text-[15px] leading-[1.8] prose-headings:text-zinc-800 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-strong:text-zinc-900 prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-200 prose-pre:rounded-xl prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline">
                          {msg.displayedContent !== undefined && msg.displayedContent !== msg.content && msg.displayedContent !== ""
                            ? <><ReactMarkdown>{msg.displayedContent}</ReactMarkdown><span className="inline-block w-0.5 h-[17px] bg-orange-400 ml-0.5 animate-pulse align-text-bottom rounded-full" /></>
                            : <ReactMarkdown>{msg.content}</ReactMarkdown>
                          }
                        </div>

                        {/* Tool cards — clean, expandable (like Perplexity sources) */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {msg.toolCalls.map((t, j) => (
                              <details key={j} className="group border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50/50">
                                <summary className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-zinc-50 transition-colors list-none">
                                  <div className="flex items-center gap-2">
                                    <span className="text-emerald-500 text-[13px]">✓</span>
                                    <span className="text-[13px] font-medium text-zinc-700">{toolIcons[t.tool]} {t.tool}</span>
                                    <span className="text-[11px] text-zinc-400 truncate max-w-[180px]">{formatToolArgs(t.tool, t.args)}</span>
                                  </div>
                                  <span className="text-[10px] text-zinc-400 font-mono shrink-0 ml-2">{t.duration}ms</span>
                                </summary>
                                <div className="px-3 py-2 border-t border-zinc-200 text-[11px] text-zinc-500 font-mono max-h-36 overflow-y-auto bg-white">
                                  {t.result?.slice(0, 800)}
                                </div>
                              </details>
                            ))}
                          </div>
                        )}

                        {/* Document download */}
                        {msg.documents && msg.documents.length > 0 && (
                          <button onClick={() => downloadDocument(msg.documents![0])}
                            className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 transition-all">
                            <span className="text-lg">📄</span>
                            <div className="text-left">
                              <p className="text-[13px] font-medium text-zinc-700">{msg.documents[0].title}</p>
                              <p className="text-[11px] text-zinc-400">Click to download</p>
                            </div>
                          </button>
                        )}

                        {/* ── Sources — Perplexity-style ── */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">Sources</p>
                            <div className="flex flex-wrap gap-2">
                              {msg.sources.map((src, j) => (
                                <a key={j} href={src.url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 transition-all group max-w-[240px]">
                                  <img src={src.favicon} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  <div className="min-w-0">
                                    <p className="text-[12px] text-zinc-700 group-hover:text-zinc-900 truncate font-medium leading-tight">{src.title}</p>
                                    <p className="text-[10px] text-zinc-400 truncate">{src.domain}</p>
                                  </div>
                                  <span className="text-zinc-300 group-hover:text-zinc-400 flex-shrink-0 ml-1">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action buttons — like ChatGPT (copy, etc.) */}
                        <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { navigator.clipboard.writeText(msg.content); }}
                            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors" title="Copy">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* ── Live Browsing Panel — floating mini-window ── */}
              {isLoading && browsingActivities.length > 0 && showBrowsingPanel && (
                <div className="ml-8 mb-3 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden max-w-[420px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 border-b border-zinc-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-[11px] font-semibold text-zinc-600">Live Browsing</span>
                      <span className="text-[10px] text-zinc-400">{browsingActivities.filter(b => b.status === "done").length}/{browsingActivities.length} pages</span>
                    </div>
                    <button onClick={() => setShowBrowsingPanel(false)}
                      className="w-5 h-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  {/* Activity list */}
                  <div className="max-h-[200px] overflow-y-auto">
                    {browsingActivities.map((activity, i) => (
                      <div key={i} className={`flex items-start gap-2.5 px-3 py-2 border-b border-zinc-50 last:border-0 transition-all duration-300 ${
                        activity.status === "loading" ? "bg-amber-50/50" : "bg-white"
                      }`}>
                        <div className="flex-shrink-0 mt-0.5">
                          {activity.status === "loading" ? (
                            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                          ) : activity.status === "done" ? (
                            <span className="text-emerald-500 text-[13px]">✓</span>
                          ) : (
                            <span className="text-amber-500 text-[13px]">◐</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium text-zinc-700 truncate">
                            {activity.domain === "DuckDuckGo" ? `🔍 ${activity.url.replace("search://", "")}` : activity.domain}
                          </p>
                          {activity.url.startsWith("http") && (
                            <p className="text-[10px] text-zinc-400 truncate">{activity.url}</p>
                          )}
                          {activity.content && (
                            <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2 leading-tight">{activity.content.slice(0, 120)}…</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live tool activity (SSE streaming) */}
              {isLoading && activeTools.length > 0 && (
                <div className="space-y-1.5 ml-8">
                  {activeTools.map((t, i) => (
                    <div key={i} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-500 ease-out ${
                      t.status === "running"
                        ? "bg-amber-50 border-amber-200 shadow-sm shadow-amber-100"
                        : "bg-emerald-50 border-emerald-200 shadow-sm shadow-emerald-100"
                    }`} style={{
                      animation: "slideInUp 0.3s ease-out",
                      animationFillMode: "both",
                      animationDelay: `${i * 80}ms`
                    }}>
                      <span className={t.status === "running" ? "animate-spin text-sm" : "text-sm"}>
                        {t.status === "running" ? "⏳" : "✅"}
                      </span>
                      <span className="text-[13px] font-medium text-zinc-700">{toolIcons[t.tool]} {t.tool}</span>
                      <span className="text-[11px] text-zinc-400 truncate max-w-[250px]">{formatToolArgs(t.tool, t.args)}</span>
                      {t.duration && <span className="text-[10px] text-emerald-500 font-mono ml-auto shrink-0">{t.duration}ms</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-center gap-2.5 ml-8">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{animationDelay: "0ms"}} />
                    <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{animationDelay: "150ms"}} />
                    <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{animationDelay: "300ms"}} />
                  </div>
                  {thinkingStatus && <span className="text-[12px] text-amber-500 font-medium">{thinkingStatus}</span>}
                  {currentModel && !thinkingStatus && (
                    <span className="text-[12px] text-zinc-400">
                      {modelIcons[currentModel.model]} {currentModel.label} is thinking…
                    </span>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ── BOTTOM INPUT ── */}
        <div className="flex-shrink-0 border-t border-zinc-100 bg-white px-5 py-3">
          <div className="max-w-[720px] mx-auto">
            {/* Voice transcript */}
            {voiceState === "listening" && input && (
              <div className="mb-2.5 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5">
                <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse shrink-0" />
                <p className="text-[14px] text-zinc-600 italic flex-1">&quot;{input}&quot;</p>
              </div>
            )}

            <div className="flex items-end gap-2.5 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2.5 focus-within:border-zinc-400 focus-within:shadow-[0_0_0_3px_rgba(0,0,0,0.04)] transition-all duration-200">
              {/* Image upload */}
              <button onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all flex-shrink-0" title="Upload image (Pixtral)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </button>
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />

              {/* Text input */}
              <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={input}
                onChange={(e) => { setInput(e.target.value); (e.target as HTMLTextAreaElement).style.height = "auto"; (e.target as HTMLTextAreaElement).style.height = Math.min((e.target as HTMLTextAreaElement).scrollHeight, 200) + "px"; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder="Ask MISSI anything…"
                rows={1}
                className="flex-1 bg-transparent text-[14px] text-zinc-800 placeholder:text-zinc-400 outline-none resize-none leading-relaxed min-h-[24px] max-h-[200px] overflow-y-auto py-0.5"
              />

              {/* Voice mini orb */}
              <div className="flex-shrink-0 cursor-pointer" onClick={handleOrbClick} title="Voice (Space)">
                <VoiceOrb state={voiceState} audioLevel={audioLevel} size={30} />
              </div>

              {/* Send button */}
              <button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-900 disabled:bg-zinc-200 disabled:text-zinc-400 text-white hover:bg-zinc-800 transition-all flex-shrink-0 disabled:cursor-not-allowed">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </div>

            <p className="text-[10px] text-zinc-400 text-center mt-2">
              25 tools · 4 Mistral models · Voxtral STT · ElevenLabs TTS · 10 languages · Space to talk
            </p>
          </div>
        </div>
      </div>

      <audio ref={audioRef} crossOrigin="anonymous" />
    </div>
  );
}
