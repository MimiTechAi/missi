"use client";

import ErrorBoundary from "@/components/ErrorBoundary";
import dynamic from "next/dynamic";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import VoiceOrb from "@/components/VoiceOrb";
import remarkGfm from "remark-gfm";
const ReactMarkdownBase = dynamic(() => import("react-markdown"), { ssr: false, loading: () => <div className="skeleton-shimmer h-4 w-3/4 rounded"></div> });
// Wrapper that always includes GFM (tables, strikethrough, task lists)
const ReactMarkdown = ({ children, ...props }: { children: string; [key: string]: unknown }) => (
  <ReactMarkdownBase remarkPlugins={[remarkGfm]} {...props}>{children}</ReactMarkdownBase>
);

// ============================================================
// Types
// ============================================================
type ToolResult = {
  tool: string;
  args: Record<string, string>;
  result: string;
  duration: number;
  chartSvg?: string;
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
  suggestions?: string[];
  image?: string;
  timestamp?: number;
  displayedContent?: string;
  responseTime?: number;
  fromVoice?: boolean;
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
  const MAX_PERSISTED = 50;
  const toSave = msgs.slice(-MAX_PERSISTED).map(m => {
    const { displayedContent, ...rest } = m;
    return rest;
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch {}
}

// ============================================================
// Typing Hook
// ============================================================
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
  // showChat removed — unused
  const [currentModel, setCurrentModel] = useState<ModelRoute | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [latestContent, setLatestContent] = useState("");
  // spokenSoFar tracked via ref — no re-render needed
  const [thinkingStatus, setThinkingStatus] = useState(""); // Live tool progress
  const [activeTools, setActiveTools] = useState<{ tool: string; args: Record<string, string>; status: "running" | "done"; result?: string; duration?: number; chartSvg?: string }[]>([]); // Live streaming tools
  const [browsingActivities, setBrowsingActivities] = useState<{ url: string; domain: string; status: "loading" | "reading" | "done"; content?: string }[]>([]);
  const [showBrowsingPanel, setShowBrowsingPanel] = useState(true);
  const [artifactPanel, setArtifactPanel] = useState<{ title: string; content: string; type: string } | null>(null);
  // Permission-gated services
  const [permissions, setPermissions] = useState<{
    gmailToken: string | null;
    folderFiles: string[] | null;
  }>({ gmailToken: null, folderFiles: null });
  const [sttLang, setSttLang] = useState("en-US");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [composioConnections, setComposioConnections] = useState<Record<string, boolean>>({});
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);

  // Check Composio connection status on mount
  useEffect(() => {
    fetch("/api/composio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    }).then(r => r.json()).then(data => {
      const connections: Record<string, boolean> = {};
      (data.toolkits || []).forEach((t: { slug: string; connected_account?: { status?: string } }) => {
        connections[t.slug] = t.connected_account?.status === "ACTIVE";
      });
      if (Object.keys(connections).length > 0) setComposioConnections(connections);
    }).catch(() => {});
  }, []);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  
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
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPlayingRef = useRef(false);
  const ttsBufferRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isOffline, setIsOffline] = useState(false);
  
  // Load messages on mount + register service worker + online/offline detection
  useEffect(() => {
    setMessages(loadMessages());
    // PWA service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // FIX #17: Offline detection
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    setIsOffline(!navigator.onLine);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);
  useEffect(() => { if (messages.length > 0) saveMessages(messages); }, [messages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, latestContent]);

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
    // Strip markdown for TTS
    const ttsText = text
      .replace(/#{1,6}\s*/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^\s*[-*]\s/gm, "")
      .replace(/^\s*\d+\.\s/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\n{2,}/g, ". ")
      .replace(/[🔍📧📅💻📊📈👁️🎨📄🌐🧮🎯✅❌⚠️🔗💡🐙📖🌤️💹🔢🎬✨🟢]/g, "")
      .trim()
      .slice(0, 4000); // ElevenLabs max ~5000 chars
    
    if (!ttsText || ttsText.length < 2) {
      setVoiceState("idle");
      return;
    }

    setVoiceState("speaking");
    
    // Show full text immediately (no progressive reveal — instant)
    if (messageIndex !== undefined) {
      setMessages(prev => {
        const updated = [...prev];
        if (updated[messageIndex]) {
          updated[messageIndex] = { ...updated[messageIndex], displayedContent: text };
        }
        return updated;
      });
    }
    
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, language: sttLangRef.current, voiceId: currentVoiceIdRef.current }),
      });
      if (res.ok && audioRef.current) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.onended = () => { URL.revokeObjectURL(url); resolve(); };
            audioRef.current.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            audioRef.current.onpause = () => { URL.revokeObjectURL(url); resolve(); };
            speechSynthesis.cancel();
            audioRef.current.play().catch(() => resolve());
          } else resolve();
        });
      }
    } catch {
      // TTS failed — continue silently
    }
    
    setAudioLevel(0);
    if (shouldRelistenRef.current && startListeningRef.current) {
      setVoiceState("listening");
      setTimeout(() => startListeningRef.current?.(), 400);
    } else {
      setVoiceState("idle");
    }
    }, []); // No deps needed — uses refs

  // ── Streaming TTS — speaks sentences as they arrive during text streaming ──
  const processTtsQueue = useCallback(async () => {
    if (ttsPlayingRef.current) return; // Already playing
    ttsPlayingRef.current = true;
    setVoiceState("speaking");

    while (ttsQueueRef.current.length > 0) {
      const sentence = ttsQueueRef.current.shift()!;
      // Strip markdown for TTS
      const ttsText = sentence
        .replace(/#{1,6}\s*/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/^\s*[-*]\s/gm, "")
        .replace(/^\s*\d+\.\s/gm, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      if (!ttsText || ttsText.length < 2) continue;

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: ttsText, language: sttLangRef.current, voiceId: currentVoiceIdRef.current }),
        });
        if (res.ok && audioRef.current) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          await new Promise<void>((resolve) => {
            audioRef.current!.src = url;
            audioRef.current!.onended = () => { URL.revokeObjectURL(url); resolve(); };
            audioRef.current!.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            audioRef.current!.onpause = () => { URL.revokeObjectURL(url); resolve(); };
            speechSynthesis.cancel(); // Safety: prevent voice mixing
            audioRef.current!.play().catch(() => resolve());
          });
          // If barge-in interrupted, clear queue
          if (audioRef.current?.paused && audioRef.current?.currentTime === 0) {
            ttsQueueRef.current = [];
            break;
          }
        }
      } catch {
        // TTS failed, continue with next sentence
      }
    }

    ttsPlayingRef.current = false;
    setVoiceState("idle");
    setAudioLevel(0);
    // Auto-relisten in continuous mode
    if (shouldRelistenRef.current && startListeningRef.current) {
      setTimeout(() => startListeningRef.current?.(), 400);
    }
  }, []);

  // Feed a text chunk into the streaming TTS pipeline
  const feedStreamingTts = useCallback((fullTextSoFar: string) => {
    const buffer = ttsBufferRef.current;
    const newText = fullTextSoFar.slice(buffer.length);
    if (!newText) return;

    // Look for sentence boundaries (period, !, ?, or newline after content)
    const sentenceEnd = newText.match(/[.!?]\s|[.!?]$|\n\n|\n-\s|\n\*\s|\n\d+\.\s|:\n/);
    if (sentenceEnd && sentenceEnd.index !== undefined) {
      const endIdx = sentenceEnd.index + sentenceEnd[0].length;
      const rawSentence = newText.slice(0, endIdx).trim();
      ttsBufferRef.current = fullTextSoFar.slice(0, buffer.length + endIdx);

      // Clean markdown for natural speech
      const cleaned = rawSentence
        .replace(/#{1,6}\s*/g, "")          // Headers
        .replace(/\*\*([^*]+)\*\*/g, "$1")  // Bold
        .replace(/\*([^*]+)\*/g, "$1")      // Italic
        .replace(/`([^`]+)`/g, "$1")        // Inline code
        .replace(/```[\s\S]*?```/g, "")     // Code blocks
        .replace(/^\s*[-*•]\s/gm, "")       // Bullet points
        .replace(/^\s*\d+\.\s/gm, "")       // Numbered lists
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
        .replace(/---+/g, "")               // Dividers
        .replace(/\n+/g, " ")               // Newlines to spaces
        .replace(/\s{2,}/g, " ")            // Multiple spaces
        .trim();

      if (cleaned.length > 5) { // Only speak meaningful content
        ttsQueueRef.current.push(cleaned);
        processTtsQueue();
      }
    }
  }, [processTtsQueue]);

  // Flush remaining TTS buffer (called when streaming is complete)
  const flushStreamingTts = useCallback((fullText: string) => {
    const remaining = fullText.slice(ttsBufferRef.current.length).trim();
    if (remaining.length > 3) {
      ttsQueueRef.current.push(remaining);
      processTtsQueue();
    }
    ttsBufferRef.current = "";
  }, [processTtsQueue]);

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
    if (isLoading) return; // Prevent double-send
    const userMessage: Message = { role: "user", content: text, image: imageData, timestamp: Date.now(), fromVoice: !!fromVoice };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    if (fromVoice) setVoiceState("thinking");
    setCurrentModel(null);
    setCurrentPlan(null);
    setLatestContent("");
    setThinkingStatus("");
    // Reset streaming TTS state for new message
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    ttsBufferRef.current = "";

    let fillerTimeout: ReturnType<typeof setTimeout> | null = null;
    const fillerPromise = Promise.resolve();

    try {
      // Keep last 16 messages for context window management (prevents overflow + saves cost)
      const recentMessages = [...messages, userMessage].slice(-16);
      const chatMessages = recentMessages.map((m) => ({ role: m.role, content: m.content }));
      
      // API call runs IN PARALLEL with filler audio
      const apiStart = Date.now();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      // Retry once on 503 (Vercel cold start)
      let res = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages,
          image: imageData || undefined,
          permissions: {
            gmailToken: permissions.gmailToken || undefined,
            fileIndex: permissions.folderFiles?.join("\n") || undefined,
            location: userLocation || undefined,
            composioConnected: Object.entries(composioConnections).filter(([, v]) => v).map(([k]) => k),
          },
        }),
      });

      // Retry on 503 (Vercel cold start / serverless timeout)
      if (res.status === 503 || res.status === 502) {
        await new Promise(r => setTimeout(r, 1500));
        const retryController = new AbortController();
        abortControllerRef.current = retryController;
        res = await fetch("/api/chat", {
          method: "POST",
          signal: retryController.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: chatMessages, permissions: {} }),
        });
      }
      
      if (!res.ok && !res.body) {
        throw new Error(`API error: ${res.status}`);
      }

      // ── SSE Stream Reader ──
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedContent = "";
      let streamedModel: ModelRoute | null = null;
      let streamedPlan: string[] | null = null;
      const streamedToolResults: ToolResult[] = [];
      let streamedDocuments: Document[] = [];
      let streamedSuggestions: string[] = [];
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
              // FIX #11: Request location lazily when location-related tools are used
              if (eventData.tool === "get_weather" || eventData.tool === "get_location") {
                requestLocation();
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
              if (eventData.tool === "generate_chart") {
                try {
                  const chartData = JSON.parse(eventData.result);
                  if (chartData._type === "chart" && chartData.svg) {
                    // Store chart SVG for inline rendering
                    streamedToolResults[streamedToolResults.length - 1].chartSvg = chartData.svg;
                  }
                } catch {}
              }
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
              // FIX #2: Auto-detect expired Gmail token from tool results
              if ((eventData.tool === "search_gmail" || eventData.tool === "read_gmail") && 
                  eventData.result?.includes("expired")) {
                setPermissions(prev => ({ ...prev, gmailToken: null }));
                setMessages(prev => [...prev, {
                  role: "assistant" as const,
                  content: "⚠️ **Gmail session expired.** Click the 📧 icon in the sidebar to reconnect.",
                  timestamp: Date.now(),
                }]);
              }
              // FIX #20: Open artifact panel for documents
              if (eventData.tool === "create_document") {
                try {
                  const docData = JSON.parse(eventData.result);
                  if (docData._type === "document") {
                    setArtifactPanel({ title: docData.title, content: docData.content, type: docData.docType || "document" });
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
              // Feed into streaming TTS pipeline — voice only
              if (fromVoice) feedStreamingTts(streamedContent);
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
              // Streaming complete — use accumulated content (deltas were already collected)
              // Don't overwrite with eventData — it might be [object Object]
              if (typeof eventData === "string" && eventData.length > streamedContent.length && !eventData.includes("[object Object]")) {
                streamedContent = eventData;
              }
              setLatestContent(streamedContent);
              break;
            }

            case "content":
              // Full content update — only if it's a clean string
              if (typeof eventData === "string" && !eventData.includes("[object Object]")) {
                streamedContent = eventData;
                setLatestContent(streamedContent);
              }
              break;

            case "done":
              if (eventData.documents) streamedDocuments = eventData.documents;
              if (eventData.model) streamedModel = eventData.model;
              if (eventData.suggestions) streamedSuggestions = eventData.suggestions;
              break;

            case "error":
              setMessages(prev => [...prev, { role: "assistant", content: `Error: ${eventData.message}`, timestamp: Date.now() }]);
              setVoiceState("idle");
              setIsLoading(false);
              return;
          }
        }
      }

      // Stop filler audio (voice only) — MUST complete before response TTS starts
      if (fromVoice) {
        if (fillerTimeout) clearTimeout(fillerTimeout); // Cancel filler if response was fast
        await fillerPromise;
        // Aggressively stop ALL audio before response plays
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        speechSynthesis.cancel(); // Kill any lingering browser TTS
        // Brief pause to ensure audio pipeline is clear
        await new Promise(r => setTimeout(r, 50));
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
          suggestions: streamedSuggestions.length > 0 ? streamedSuggestions : undefined,
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

        // Only speak response if original message was voice input
        if (fromVoice) {
          await speakText(streamedContent, msgIndex);
        } else {
          // Non-voice response — but if continuous mode, restart listening
          if (shouldRelistenRef.current && startListeningRef.current) {
            setVoiceState("listening");
            setTimeout(() => startListeningRef.current?.(), 600);
          } else {
            setVoiceState("idle");
          }
        }
      }
      setActiveTools([]);
      ttsBufferRef.current = "";
      abortControllerRef.current = null;
    } catch (err) {
      abortControllerRef.current = null;
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — clean exit
        setVoiceState("idle");
        setIsLoading(false);
        setThinkingStatus("");
        setActiveTools([]);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection lost. Please try again.", timestamp: Date.now() }]);
      setVoiceState("idle");
    } finally { setIsLoading(false); setThinkingStatus(""); setActiveTools([]); }
  }, [messages, speakText, feedStreamingTts, flushStreamingTts]);

  // Keep ref in sync
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ============================================================
  // Voxtral STT — Mistral-native Speech-to-Text
  // Records via MediaRecorder, detects silence via AudioContext,
  // Dynamic page title — update with first conversation topic
  useEffect(() => {
    if (messages.length === 0) {
      document.title = "MISSI — Voice-First AI OS by MiMi Tech AI";
    } else {
      const lastUserMsg = messages.filter(m => m.role === "user").slice(-1)[0];
      if (lastUserMsg) {
        const topic = lastUserMsg.content.slice(0, 40).trim();
        document.title = `${topic}… — MISSI`;
      }
    }
  }, [messages]);

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
    const SILENCE_THRESHOLD = 0.018; // RMS below this = silence (tuned for real rooms)
    const SILENCE_DURATION = 2200; // ms of silence before auto-sending (human-like pause)
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

          // Show "transcribing" state — in status bar, not input field (FIX #15)
          setInput("");
          setThinkingStatus("🎙️ Transcribing...");
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
          // ElevenLabs unavailable — skip greeting voice to avoid voice mixing
          console.warn("ElevenLabs unavailable for greeting");
        }
      } catch {
        // Network error — skip greeting voice
        console.warn("TTS network error for greeting");
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
    const isHtml = doc.content.includes("<!DOCTYPE html") || doc.content.includes("<html");
    const blob = new Blob([isHtml ? doc.content : `# ${doc.title}\n\n${doc.content}`], { type: isHtml ? "text/html" : "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${doc.title.replace(/\s+/g, "-").toLowerCase()}.${isHtml ? "html" : "md"}`;
    a.click(); URL.revokeObjectURL(url);
  };

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    speechSynthesis.cancel();
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    ttsBufferRef.current = "";
    setIsLoading(false);
    setVoiceState("idle");
    setThinkingStatus("");
    setActiveTools([]);
    setAudioLevel(0);
  }, []);

  const clearConversation = () => {
    setMessages([]); setInput(""); localStorage.removeItem(STORAGE_KEY);
    setCurrentModel(null); setCurrentPlan(null); setLatestContent("");
    setConversationId(null); setActiveTools([]); setBrowsingActivities([]);
    ttsQueueRef.current = []; ttsBufferRef.current = "";
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (messages.length === 0 || confirm("Clear conversation? This cannot be undone.")) {
          clearConversation();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [clearConversation]);

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
      // Visual feedback
      setMessages(prev => [...prev, {
        role: "assistant" as const,
        content: `📂 **Folder connected!** I can see ${fileList.length} files in "${dirHandle.name}". Try asking me to search for something.`,
        timestamp: Date.now(),
      }]);
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
            // Visual feedback: add a system-like message confirming connection
            setMessages(prev => [...prev, {
              role: "assistant" as const,
              content: "✅ **Gmail connected!** I can now search and read your emails. Try asking me to check your unread emails or search for specific messages.",
              timestamp: Date.now(),
            }]);
          }
        } catch {}
      }
    };
    window.addEventListener("message", handler);
  }, []);

  // ── Composio: Connect external toolkit (Gmail, Calendar, GitHub, etc.) ──
  const connectToolkit = useCallback(async (toolkit: string) => {
    // All toolkits (including Gmail) now use Composio Tool Router
    setConnectingToolkit(toolkit);
    try {
      const res = await fetch("/api/composio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", toolkit }),
      });
      const data = await res.json();
      if (data.url) {
        // Open connect link in popup
        const popup = window.open(data.url, `connect_${toolkit}`, "width=600,height=700");
        // Poll for completion + verify
        const checkInterval = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(checkInterval);
            // Verify connection actually succeeded
            try {
              const verifyRes = await fetch("/api/composio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "status", toolkit }),
              });
              const verifyData = await verifyRes.json();
              const isConnected = verifyData.toolkits?.length > 0 || verifyRes.ok;
              setComposioConnections(prev => ({ ...prev, [toolkit]: isConnected }));
              if (isConnected) {
                setMessages(prev => [...prev, {
                  role: "assistant" as const,
                  content: `✅ **${toolkit.charAt(0).toUpperCase() + toolkit.slice(1)} connected!** I can now access your ${toolkit} data. Just ask me anything about it.`,
                  timestamp: Date.now(),
                }]);
              }
            } catch {
              // Assume connected if verification fails (network error)
              setComposioConnections(prev => ({ ...prev, [toolkit]: true }));
            }
            setConnectingToolkit(null);
          }
        }, 1000);
        // Timeout after 2 minutes
        setTimeout(() => { clearInterval(checkInterval); setConnectingToolkit(null); }, 120000);
      } else if (data.error) {
        setConnectingToolkit(null);
        console.error("Composio connect error:", data.message);
      }
    } catch {
      setConnectingToolkit(null);
    }
  }, []);

  // ── Sound Effects (Web Audio API) ──
  const playSound = useCallback((type: "activate" | "success" | "error") => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.15;
      if (type === "activate") { osc.frequency.value = 880; gain.gain.value = 0.12; }
      else if (type === "success") { osc.frequency.value = 660; }
      else { osc.frequency.value = 220; }
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }, []);

  // ── Geolocation (lazy — only when needed) ──
  const [userLocation, setUserLocation] = useState<string>("");
  const locationRequestedRef = useRef(false);
  const requestLocation = useCallback(() => {
    if (locationRequestedRef.current || userLocation) return;
    locationRequestedRef.current = true;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          // Reverse geocode via Nominatim (FIX #13)
          try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`);
            const geoData = await geoRes.json();
            const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || "";
            const country = geoData.address?.country || "";
            const locStr = city ? `${city}, ${country} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})` : `Latitude: ${latitude.toFixed(4)}, Longitude: ${longitude.toFixed(4)}`;
            setUserLocation(locStr);
          } catch {
            setUserLocation(`Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}`);
          }
        },
        () => {} // permission denied — that's ok
      );
    }
  }, [userLocation]);

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
              // Barge-in detected
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
      } catch {
        // Barge-in mic denied — silent fail
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
   
  }, [voiceState]);

  // ── Wake Word Detection ("Hey Missi") ──
  const activateRef = useRef(activate);
  useEffect(() => { activateRef.current = activate; }, [activate]);
  
  useEffect(() => {
    if (!wakeWordEnabled || continuousMode || voiceState !== "idle") return; // Wake word disabled or already active
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
        if (transcript.includes("hey missi") || transcript.includes("hey missy") || transcript.includes("hey miss") || /\bmissi\b/.test(transcript)) {
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
  }, [wakeWordEnabled, continuousMode, voiceState, playSound]);

  // ── Notification Permission (lazy — only when reminder is set) + Scheduling ──
  const scheduleReminder = useCallback((message: string, delayMs: number) => {
    // Request permission only when actually needed (FIX #12)
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    const reminderTimeout = setTimeout(() => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
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

  // Brand icons for sidebar integrations
  const brandIcon = (id: string, size = 18) => {
    const icons: Record<string, React.ReactNode> = {
      gmail: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M2 6l10 7 10-7" stroke="#EA4335" strokeWidth="2"/><rect x="2" y="5" width="20" height="14" rx="2" stroke="#4285F4" strokeWidth="1.5" fill="none"/><path d="M2 5l10 7" stroke="#FBBC05" strokeWidth="1.5"/><path d="M22 5l-10 7" stroke="#34A853" strokeWidth="1.5"/></svg>,
      calendar: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" strokeWidth="1.5"/><path d="M3 10h18" stroke="#4285F4" strokeWidth="1.5"/><path d="M8 2v4M16 2v4" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="15" r="1.5" fill="#EA4335"/><circle cx="12" cy="15" r="1.5" fill="#FBBC05"/><circle cx="16" cy="15" r="1.5" fill="#34A853"/></svg>,
      github: <svg width={size} height={size} viewBox="0 0 24 24" fill="#24292e"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>,
      slack: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z" fill="#E01E5A"/></svg>,
      drive: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M7.71 3.5L1.15 15l3.43 6L11.14 9.5 7.71 3.5z" fill="#0066DA"/><path d="M16.29 3.5H7.71l3.43 6h8.57l-3.42-6z" fill="#00AC47"/><path d="M22.85 15l-3.42-6h-8.57l3.43 6h8.56z" fill="#EA4335"/><path d="M4.58 21l6.56-12-3.43-6L1.15 15l3.43 6z" fill="#00832D"/><path d="M11.14 21h8.57l3.14-6h-8.57L11.14 21z" fill="#2684FC"/><path d="M19.43 9.5l-3.14 6H4.58l3.43-6h11.42z" fill="#FFBA00"/></svg>,
      notion: <svg width={size} height={size} viewBox="0 0 24 24" fill="#000"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.38 2.33c-.42-.326-.98-.7-2.055-.607L3.01 2.87c-.466.046-.56.28-.374.466l1.823 1.372zm.793 3.358v13.889c0 .746.373 1.026 1.213.98l14.523-.84c.84-.046.933-.56.933-1.166V6.732c0-.606-.233-.933-.746-.886l-15.176.886c-.56.047-.747.327-.747.834zm14.337.745c.093.42 0 .84-.42.886l-.7.14v10.264c-.607.327-1.166.514-1.633.514-.746 0-.933-.234-1.493-.934l-4.577-7.186v6.953l1.446.327s0 .84-1.166.84l-3.218.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.451-.233 4.764 7.279v-6.44l-1.213-.14c-.093-.513.28-.886.746-.933l3.226-.186z"/></svg>,
    };
    return icons[id] || <span className="text-lg">{id === "gmail" ? "📧" : "🔗"}</span>;
  };

  // FIX #22: Copy code to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Brief visual feedback handled by the button itself
    }).catch(() => {});
  }, []);

  // FIX #25: Copy full response
  const copyResponse = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => {}).catch(() => {});
  }, []);


  const modelIcons: Record<string, string> = {
    "mistral-small-latest": "⚡", "magistral-medium-latest": "🧮", "mistral-medium-latest": "🎨", "mistral-ocr-latest": "📄",
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




  // ═══ DEMO MODE — MISSI introduces herself for video recording ═══
  const startDemo = useCallback(async () => {
    const steps = [
      { msg: "Hey MISSI! Introduce yourself — what are you and what can you do?", wait: 18000 },
      { msg: "Show me the weather in Berlin right now", wait: 12000 },
      { msg: "What are the latest AI news today?", wait: 18000 },
      { msg: "Check my emails and calendar", wait: 14000 },
      { msg: "Tesla stock price and Bitcoin", wait: 10000 },
      { msg: "Show my GitHub repos", wait: 8000 },
      { msg: "Create a pie chart: Python 35%, JavaScript 28%, TypeScript 20%, Rust 10%, Go 7%", wait: 12000 },
    ];
    
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 1500 : 3000));
      // Type effect — show message appearing character by character
      const input = document.querySelector("input") as HTMLInputElement;
      if (input) {
        input.focus();
        const msg = steps[i].msg;
        for (let c = 0; c < msg.length; c++) {
          input.value = msg.substring(0, c + 1);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise(r => setTimeout(r, 25 + Math.random() * 20));
        }
        await new Promise(r => setTimeout(r, 500));
      }
      sendMessage(steps[i].msg);
      await new Promise(r => setTimeout(r, steps[i].wait));
    }
  }, [sendMessage]);

  return (
    <ErrorBoundary>
    <div
      className="h-[100dvh] mesh-bg text-zinc-900 flex overflow-hidden"
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
      <aside className="hidden md:flex w-[56px] flex-shrink-0 glass-panel border-r border-zinc-200/50 flex-col items-center py-4 gap-3 z-20">
        {/* Logo */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 flex items-center justify-center text-xs font-black text-white shadow-md shadow-orange-500/25 mb-1">
          M
        </div>

        {/* Nav icons */}
        <button className="sidebar-icon w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-orange-500 hover:bg-orange-50/50" title="Chat" aria-label="Chat">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button onClick={handleOrbClick}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 sidebar-icon ${
            voiceState !== "idle"
              ? "bg-orange-50 text-orange-500 ring-1 ring-orange-200"
              : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
          }`} title="Voice" aria-label="Toggle voice input">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        </button>
        <button onClick={connectFolder}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 sidebar-icon ${
            permissions.folderFiles && permissions.folderFiles.length > 0
              ? "bg-emerald-50 text-emerald-500 ring-1 ring-emerald-200"
              : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
          }`} title="Files" aria-label="Connect local files">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>
        <div className="w-6 border-t border-zinc-200/60 my-1" />
        {/* Composio Integrations — 10,000+ tools */}
        {[
          { id: "gmail", icon: "gmail", label: "Gmail" },
          { id: "googlecalendar", icon: "calendar", label: "Calendar" },
          { id: "github", icon: "github", label: "GitHub" },
          { id: "slack", icon: "slack", label: "Slack" },
          { id: "notion", icon: "notion", label: "Notion" },
          { id: "googledrive", icon: "drive", label: "Drive" },
        ].map(tk => (
          <button key={tk.id} onClick={() => connectToolkit(tk.id)}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 text-[13px] sidebar-icon ${
              composioConnections[tk.id]
                ? "bg-emerald-50 ring-1 ring-emerald-200"
                : connectingToolkit === tk.id
                ? "bg-amber-50 ring-1 ring-amber-200 animate-pulse"
                : "hover:bg-zinc-100"
            }`} title={`${composioConnections[tk.id] ? "✓ " : ""}${tk.label}`} aria-label={`Connect ${tk.label}`}>
            {brandIcon(tk.icon)}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Language & clear */}
        <button onClick={() => setWakeWordEnabled(p => !p)}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 text-[11px] sidebar-icon ${
            wakeWordEnabled ? "bg-orange-50 text-orange-500 ring-1 ring-orange-200" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
          }`} title={`Wake word "Hey Missi": ${wakeWordEnabled ? "ON" : "OFF"}`} aria-label="Toggle wake word detection">
          👋
        </button>
        <select value={sttLang} onChange={(e) => setSttLang(e.target.value)}
          className="w-8 h-7 bg-transparent text-zinc-400 text-[9px] cursor-pointer hover:text-zinc-600 text-center rounded-lg hover:bg-zinc-100 transition-colors border-0 outline-none appearance-none font-mono">
          {[["de-DE","DE"],["en-US","EN"],["fr-FR","FR"],["es-ES","ES"],["it-IT","IT"],["pt-BR","PT"],["ja-JP","JA"],["ko-KR","KO"],["zh-CN","ZH"],["ru-RU","RU"]].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button onClick={() => { setMessages([]); saveMessages([]); }}
          aria-label="Clear conversation" className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50/50 transition-all duration-200 sidebar-icon" title="Clear (⌘K)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </aside>
      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowMobileSidebar(false)} />
          <aside className="relative w-[240px] bg-white/95 backdrop-blur-xl shadow-2xl flex flex-col py-4 px-4 gap-1 animate-slide-in border-r border-zinc-200/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 flex items-center justify-center text-[11px] font-black text-white shadow-md">M</div>
                <span className="text-[15px] font-bold text-zinc-800">MISSI</span>
              </div>
              <button onClick={() => setShowMobileSidebar(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <button onClick={() => { connectFolder(); setShowMobileSidebar(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left mb-2 ${
                permissions.folderFiles && permissions.folderFiles.length > 0 ? "bg-emerald-50 border border-emerald-200" : "hover:bg-zinc-50 border border-transparent"
              }`}>
              <span className="text-[18px]">📁</span>
              <div>
                <p className="text-[13px] font-medium text-zinc-700">{permissions.folderFiles ? "✓ Local Files" : "Local Files"}</p>
                <p className="text-[11px] text-zinc-400">Connect a folder</p>
              </div>
            </button>
            <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 px-1">Integrations</p>
            {[
              { id: "gmail", icon: "gmail", label: "Gmail", desc: "Read & search emails" },
              { id: "googlecalendar", icon: "calendar", label: "Calendar", desc: "View upcoming events" },
              { id: "github", icon: "github", label: "GitHub", desc: "Issues, PRs, repos" },
              { id: "slack", icon: "slack", label: "Slack", desc: "Messages & channels" },
              { id: "notion", icon: "notion", label: "Notion", desc: "Pages & databases" },
            ].map(tk => (
              <button key={tk.id} onClick={() => { connectToolkit(tk.id); setShowMobileSidebar(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  composioConnections[tk.id] ? "bg-emerald-50 border border-emerald-200" :
                  connectingToolkit === tk.id ? "bg-amber-50 border border-amber-200 animate-pulse" :
                  "hover:bg-zinc-50 border border-transparent"
                }`}>
                <span className="flex items-center justify-center w-5 h-5">{brandIcon(tk.icon)}</span>
                <div>
                  <p className="text-[13px] font-medium text-zinc-700">{composioConnections[tk.id] ? `✓ ${tk.label}` : tk.label}</p>
                  <p className="text-[11px] text-zinc-400">{tk.desc}</p>
                </div>
              </button>
            ))}
            <div className="mt-4 border-t border-zinc-100 pt-3">
              <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 px-1">Settings</p>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[11px] text-zinc-500">Language:</span>
                <select value={sttLang} onChange={(e) => setSttLang(e.target.value)}
                  className="bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-[12px] text-zinc-600 font-mono">
                  {[["de-DE","Deutsch"],["en-US","English"],["fr-FR","Français"],["es-ES","Español"],["it-IT","Italiano"],["pt-BR","Português"],["ja-JP","日本語"],["ko-KR","한국어"],["zh-CN","中文"],["ru-RU","Русский"]].map(([v,l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
          </aside>
        </div>
      )}


      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── TOP BAR ── */}
        <header className="flex-shrink-0 h-12 border-b border-zinc-200/50 flex items-center justify-between px-6 glass-panel z-10">
          <div className="flex items-center gap-2.5">
            {/* Mobile menu toggle */}
            <button onClick={() => setShowMobileSidebar(!showMobileSidebar)} className="md:hidden w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all -ml-1" aria-label="Menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <span className="text-[13px] font-semibold text-zinc-800">MISSI</span>
            {isOffline && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-500 font-medium">Offline</span>}
            <span className="text-[11px] text-zinc-400/70 font-medium hidden sm:inline">
              6 Mistral Models · Voxtral STT · ElevenLabs TTS · 10,000+ Integrations via Composio
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {currentModel && (
              <span className={`text-[11px] px-3 py-1 rounded-full bg-white/80 border border-zinc-200/40 font-medium animate-scale-in shadow-sm backdrop-blur-sm ${
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
                🛠 {stats.totalTools} tool{stats.totalTools !== 1 ? "s" : ""} used
              </span>
            )}
            {messages.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-500" title="Conversation context — MISSI remembers all messages">
                📝 {messages.length} in context
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
          /* IDLE: Hero centered — premium design */
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
            {/* Ambient glow behind orb */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-40 h-40 rounded-full bg-orange-100/40 blur-3xl" />
              <div className="relative z-10">
                <VoiceOrb state={voiceState} audioLevel={audioLevel} size={96} onClick={handleOrbClick} />
              </div>
            </div>
            <h2 className="mt-6 text-[24px] sm:text-[28px] font-bold text-zinc-900 tracking-[-0.5px] text-center leading-tight">
              {({de:"Wie kann ich dir helfen?",fr:"Comment puis-je vous aider?",es:"¿Cómo puedo ayudarte?",it:"Come posso aiutarti?",pt:"Como posso ajudar?",ja:"何をお手伝いしましょうか？",ko:"무엇을 도와드릴까요?",zh:"我能帮你什么？",en:"What can I help with?"})[sttLang.split("-")[0]] || "What can I help with?"}
            </h2>
            <p className="mt-2 text-[13px] text-zinc-400 text-center max-w-xs">
              {({de:"Voice-First KI — sprich natürlich, tippe, oder zieh ein Bild rein",fr:"IA vocale — parlez naturellement, tapez ou déposez une image",es:"IA de voz — habla naturalmente, escribe o arrastra una imagen",en:"Voice-first AI — speak naturally, type, or drop an image"})[sttLang.split("-")[0]] || "Voice-first AI — speak naturally, type, or drop an image"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-300 text-center">
              <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-[10px] border border-zinc-200">Space</kbd> voice · <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-[10px] border border-zinc-200">Esc</kbd> stop · <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-[10px] border border-zinc-200">⌘K</kbd> clear
            </p>

            {voiceState === "idle" && (
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                {(() => {
                  const promptsByLang: Record<string, {icon: string; text: string}[]> = {
                    "de": [
                      {icon:"🔍", text:"KI-News von heute"},
                      {icon:"🌤️", text:"Wetter in Berlin"},
                      {icon:"📈", text:"Tesla & Bitcoin Preis"},
                      {icon:"💻", text:"Python-Skript schreiben"},
                      {icon:"📧", text:"Zeig meine E-Mails"},
                      {icon:"📊", text:"Erstelle einen Chart mit Umsatzdaten"},
                    ],
                    "en": [
                      {icon:"🔍", text:"Latest AI news today"},
                      {icon:"🌤️", text:"Weather in New York"},
                      {icon:"📈", text:"Tesla & Bitcoin price"},
                      {icon:"💻", text:"Write a Python script"},
                      {icon:"📧", text:"Check my emails"},
                      {icon:"📊", text:"Create a bar chart of AI funding 2020-2025"},
                    ],
                    "fr": [
                      {icon:"🔍", text:"Actualités IA du jour"},
                      {icon:"🌤️", text:"Météo à Paris"},
                      {icon:"📈", text:"Prix Tesla et Bitcoin"},
                      {icon:"💻", text:"Écrire du code Python"},
                      {icon:"📧", text:"Voir mes e-mails"},
                      {icon:"🌐", text:"Traduire en anglais"},
                    ],
                    "es": [
                      {icon:"🔍", text:"Noticias de IA de hoy"},
                      {icon:"🌤️", text:"Tiempo en Madrid"},
                      {icon:"📈", text:"Precio Tesla y Bitcoin"},
                      {icon:"💻", text:"Escribir código Python"},
                      {icon:"📧", text:"Conectar Gmail"},
                      {icon:"🌐", text:"Traducir al inglés"},
                    ],
                  };
                  const langKey = sttLang.split("-")[0];
                  const prompts = promptsByLang[langKey] || promptsByLang["en"];
                  return prompts.map((p) => (
                    <button key={p.text} onClick={() => sendMessage(p.text)}
                      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/70 hover:bg-white border border-zinc-200/50 hover:border-orange-300/60 text-left transition-all duration-200 hover:shadow-lg hover:shadow-orange-100/40 group shadow-sm backdrop-blur-sm">
                      <span className="text-[18px] group-hover:scale-110 transition-transform duration-200 flex-shrink-0">{p.icon}</span>
                      <span className="text-[13px] font-medium text-zinc-600 group-hover:text-zinc-900 leading-snug">{p.text}</span>
                      <svg className="ml-auto w-3.5 h-3.5 text-zinc-300 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  ));
                })()}
              </div>
            )}

            {/* Capabilities strip */}
            {voiceState === "idle" && (
              <div className="mt-7 flex flex-wrap justify-center gap-x-4 gap-y-1 max-w-lg">
                {[
                  ...(() => {
                    const l = sttLang.split("-")[0];
                    const labels: Record<string, Record<string, string>> = {
                      de: {Search:"Suche",Gmail:"E-Mail",Calendar:"Kalender",Code:"Code",Charts:"Diagramme",Finance:"Finanzen",Vision:"Vision",Images:"Bilder",OCR:"OCR",Tools:"10K+ Tools"},
                      fr: {Search:"Recherche",Gmail:"E-mail",Calendar:"Calendrier",Code:"Code",Charts:"Graphiques",Finance:"Finance",Vision:"Vision",Images:"Images",OCR:"OCR",Tools:"10K+ Outils"},
                      es: {Search:"Búsqueda",Gmail:"Correo",Calendar:"Calendario",Code:"Código",Charts:"Gráficos",Finance:"Finanzas",Vision:"Visión",Images:"Imágenes",OCR:"OCR",Tools:"10K+ Herramientas"},
                    };
                    const t = labels[l] || {};
                    return [
                      { icon: "🔍", label: t.Search || "Search" },
                      { icon: "📧", label: t.Gmail || "Gmail" },
                      { icon: "📅", label: t.Calendar || "Calendar" },
                      { icon: "💻", label: t.Code || "Code" },
                      { icon: "📊", label: t.Charts || "Charts" },
                      { icon: "📈", label: t.Finance || "Finance" },
                      { icon: "👁️", label: t.Vision || "Vision" },
                      { icon: "🎨", label: t.Images || "Images" },
                      { icon: "📄", label: t.OCR || "OCR" },
                      { icon: "🌐", label: t.Tools || "10K+ Tools" },
                    ];
                  })(),
                ].map((cap) => (
                  <span key={cap.label} className="inline-flex items-center gap-1 text-[11px] text-zinc-400/70 bg-white/50 border border-zinc-200/30 rounded-full px-2.5 py-0.5 backdrop-blur-sm">
                    <span className="text-[11px]">{cap.icon}</span>{cap.label}
                  </span>
                ))}
              </div>
            )}

            {input && voiceState === "listening" && (
              <p className="mt-6 text-zinc-500 text-base italic max-w-md text-center">&quot;{input}&quot;</p>
            )}
          </div>
        ) : (
          /* CHAT: Full-width messages (like ChatGPT/Perplexity) */
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="max-w-[720px] mx-auto px-3 sm:px-6 py-8 sm:py-10 space-y-8 sm:space-y-10" aria-live="polite">
              {/* FIX #21: Typing indicator when loading but no streaming message yet */}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="animate-slide-in">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 flex items-center justify-center text-[10px] font-black text-white shadow-md shadow-orange-500/20">M</div>
                    <span className="text-[13px] font-semibold text-zinc-800">MISSI</span>
                    {thinkingStatus && <span className="text-[11px] text-amber-500 animate-pulse">{thinkingStatus}</span>}
                  </div>
                  <div className="ml-8 flex items-center gap-1.5">
                    <span className="thinking-dot w-2 h-2 rounded-full bg-orange-400" />
                    <span className="thinking-dot w-2 h-2 rounded-full bg-orange-400" />
                    <span className="thinking-dot w-2 h-2 rounded-full bg-orange-400" />
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className="animate-slide-in">
                  {/* USER MESSAGE */}
                  {msg.role === "user" && (
                    <div className="flex justify-end mb-5">
                      <div className="max-w-[85%] sm:max-w-[75%] bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg shadow-zinc-900/15">
                        {msg.fromVoice && (
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400/70 mb-1.5">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/></svg>
                            🎙️ Voxtral
                          </div>
                        )}
                        <p className="text-[14px] text-zinc-100 leading-relaxed">{msg.content}</p>
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
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 flex items-center justify-center text-[10px] font-black text-white shadow-md shadow-orange-500/20">M</div>
                        <span className="text-[13px] font-semibold text-zinc-800">MISSI</span>
                        {msg.model && (
                          <span className={`text-[11px] font-medium ${
                            msg.model.model.includes("large") ? "text-violet-500" :
                            msg.model.model.includes("codestral") ? "text-emerald-500" :
                            msg.model.model.includes("pixtral") ? "text-pink-500" :
                            "text-amber-500"
                          }`}>
                            {modelIcons[msg.model.model]} {msg.model.model.includes("large") ? "Intelligence" : msg.model.model.includes("codestral") ? "Code" : msg.model.model.includes("pixtral") ? "Vision" : "Fast"}
                          </span>
                        )}
                        {msg.responseTime && (
                          <span className="text-[11px] text-zinc-300/80 tabular-nums">· {msg.responseTime >= 1000 ? `${(msg.responseTime/1000).toFixed(1)}s` : `${msg.responseTime}ms`}</span>
                        )}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <span className="text-[11px] text-zinc-400 opacity-40">· {msg.toolCalls?.length} tool{msg.toolCalls?.length !== 1 ? "s" : ""}</span>
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
                        <div className="prose prose-zinc prose-sm max-w-none text-[15px] leading-[1.8] prose-headings:text-zinc-800 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-strong:text-zinc-900 prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:border-0 prose-pre:rounded-xl prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                          {/* Streaming cursor — shows while this message is still being generated */}
                          {isLoading && i === messages.length - 1 && msg.role === "assistant" && (
                            <span className="inline-block w-[3px] h-[18px] bg-orange-400 ml-0.5 animate-pulse align-text-bottom rounded-full" />
                          )}
                        </div>
                        {/* FIX #22 + #25: Action buttons — Copy, Listen */}
                        {!isLoading && msg.content && msg.content.length > 10 && (
                          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button onClick={() => copyResponse(msg.content)} className="px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all flex items-center gap-1" title="Copy response">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                              Copy
                            </button>
                            <button onClick={() => speakText(msg.content, i)} className="px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all flex items-center gap-1" title="Listen">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                              Listen
                            </button>
                          </div>
                        )}


                        {/* Interactive Tool Visuals */}
                        {msg.toolCalls && msg.toolCalls.map((t, j) => {
                          if (t.tool === "get_weather") {
                            return (
                              <div key={`viz-${j}`} className="mt-4 p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 shadow-sm animate-scale-in">
                                <div className="flex items-center gap-4">
                                  <span className="text-4xl">🌤️</span>
                                  <div>
                                    <p className="text-sm font-semibold text-blue-900">{t.args.location}</p>
                                    <div className="prose prose-sm prose-indigo">
                                      <ReactMarkdown>{t.result}</ReactMarkdown>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          if (t.tool === "get_stock_price" || t.tool === "get_crypto_price") {
                            const isStock = t.tool === "get_stock_price";
                            return (
                              <div key={`viz-${j}`} className="mt-4 p-5 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 border border-zinc-700/50 shadow-xl animate-scale-in">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-2xl">{isStock ? "📈" : "🪙"}</span>
                                    <p className="text-sm font-bold text-zinc-100 uppercase tracking-wider">{isStock ? t.args.symbol : t.args.coin}</p>
                                  </div>
                                  <span className="text-[10px] text-emerald-400/80 font-mono flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    LIVE
                                  </span>
                                </div>
                                <div className="prose prose-invert prose-sm">
                                  <ReactMarkdown>{t.result}</ReactMarkdown>
                                </div>
                              </div>
                            );
                          }
                          if (t.tool === "news_headlines") {
                            return (
                              <div key={`viz-${j}`} className="mt-4 p-5 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-100 shadow-sm animate-scale-in">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-xl">📰</span>
                                  <p className="text-sm font-semibold text-violet-900">Headlines</p>
                                </div>
                                <div className="prose prose-sm prose-violet">
                                  <ReactMarkdown>{t.result}</ReactMarkdown>
                                </div>
                              </div>
                            );
                          }
                          if (t.tool === "wikipedia") {
                            return (
                              <div key={`viz-${j}`} className="mt-4 p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 shadow-sm animate-scale-in">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-xl">📖</span>
                                  <p className="text-sm font-semibold text-amber-900">Wikipedia</p>
                                </div>
                                <div className="prose prose-sm prose-amber">
                                  <ReactMarkdown>{t.result}</ReactMarkdown>
                                </div>
                              </div>
                            );
                          }
                          if (t.tool === "run_code" || t.tool === "generate_code") {
                            return (
                              <div key={`viz-${j}`} className="mt-4 rounded-2xl bg-zinc-900 border border-zinc-700/50 shadow-xl animate-scale-in overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/80 border-b border-zinc-700/50">
                                  <div className="flex gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                                  </div>
                                  <span className="text-[11px] text-zinc-500 ml-2 font-mono">
                                    {t.tool === "run_code" ? "Output" : t.args.language || "Code"}
                                  </span>
                                </div>
                                <div className="p-4 prose prose-invert prose-sm max-h-[300px] overflow-y-auto">
                                  <ReactMarkdown>{t.result}</ReactMarkdown>
                                </div>
                              </div>
                            );
                          }
                          if (t.tool === "translate") {
                            return (
                              <div key={`viz-${j}`} className="mt-4 p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 shadow-sm animate-scale-in">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-xl">🌍</span>
                                  <p className="text-sm font-semibold text-emerald-900">Translation</p>
                                </div>
                                <div className="prose prose-sm prose-emerald">
                                  <ReactMarkdown>{t.result}</ReactMarkdown>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })}

                        {/* Inline Charts */}
                        {msg.toolCalls?.filter(t => t.chartSvg).map((t, j) => (
                          <div key={"chart-" + j} className="mt-3 p-4 rounded-2xl bg-white border border-zinc-200/60 shadow-sm">
                            <div dangerouslySetInnerHTML={{ __html: t.chartSvg || "" }} className="w-full max-w-[420px] mx-auto bg-white rounded-xl border border-zinc-100 p-4 shadow-sm" />
                          </div>
                        ))}

                        {/* Tool summary — minimal, expandable on click */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <details className="mt-2 group">
                            <summary className="flex items-center gap-2 cursor-pointer list-none text-[12px] text-zinc-400 hover:text-zinc-600 transition-colors select-none">
                              <span className="text-emerald-500">✓</span>
                              <span>Used {msg.toolCalls.length} tool{msg.toolCalls.length > 1 ? "s" : ""}</span>
                              <span className="text-zinc-300">·</span>
                              <span className="truncate max-w-[300px]">
                                {msg.toolCalls.map(t => {
                                  const labels: Record<string, string> = {
                          web_search: "Searched the web", get_weather: "Checked weather",
                          get_time: "Got time", calculate: "Calculated",
                          run_code: "Ran code", read_webpage: "Read webpage",
                          create_document: "Created document", translate: "Translated",
                          analyze_data: "Analyzed data", generate_code: "Generated code",
                          search_gmail: "Searched emails", read_gmail: "Read email",
                          get_calendar: "Checked calendar", get_stock_price: "Fetched stock price",
                          get_crypto_price: "Checked crypto", wikipedia: "Looked up Wikipedia",
                          news_headlines: "Got headlines", summarize_text: "Summarized",
                          search_files: "Searched files", get_location: "Got location",
                          set_reminder: "Set reminder", change_voice: "Changed voice",
                          unit_convert: "Converted units", define_word: "Defined word",
                          random_fact: "Found fact",
                        };
                                  return labels[t.tool] || t.tool;
                                }).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                              </span>
                              <svg className="w-3 h-3 text-zinc-300 group-open:rotate-180 transition-transform ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                            </summary>
                            <div className="mt-2 space-y-1 ml-4">
                              {msg.toolCalls.map((t, j) => {
                                const labels: Record<string, string> = {
                          web_search: "Searched the web", get_weather: "Checked weather",
                          get_time: "Got time", calculate: "Calculated",
                          run_code: "Ran code", read_webpage: "Read webpage",
                          create_document: "Created document", translate: "Translated",
                          analyze_data: "Analyzed data", generate_code: "Generated code",
                          search_gmail: "Searched emails", read_gmail: "Read email",
                          get_calendar: "Checked calendar", get_stock_price: "Fetched stock price",
                          get_crypto_price: "Checked crypto", wikipedia: "Looked up Wikipedia",
                          news_headlines: "Got headlines", summarize_text: "Summarized",
                          search_files: "Searched files", get_location: "Got location",
                          set_reminder: "Set reminder", change_voice: "Changed voice",
                          unit_convert: "Converted units", define_word: "Defined word",
                          random_fact: "Found fact",
                        };
                                return (
                                  <div key={j} className="flex items-center gap-2 text-[11px] text-zinc-400 py-0.5">
                                    <span className="text-emerald-400">✓</span>
                                    <span>{labels[t.tool] || t.tool}</span>
                                    {t.duration && <span className="text-zinc-300 font-mono text-[10px]">{t.duration}ms</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}

                        {/* Document / Artifact cards — click to open canvas panel */}
                        {msg.documents && msg.documents.length > 0 && (
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => setArtifactPanel(msg.documents![0])}
                              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 border border-orange-200 hover:border-orange-300 transition-all group">
                              <span className="text-lg">✨</span>
                              <div className="text-left">
                                <p className="text-[13px] font-medium text-zinc-700 group-hover:text-zinc-900">{msg.documents[0].title}</p>
                                <p className="text-[11px] text-orange-500">Open Artifact</p>
                              </div>
                            </button>
                            <button onClick={() => downloadDocument(msg.documents![0])}
                              className="px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-400 hover:text-zinc-600 transition-all" title="Download">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </button>
                          </div>
                        )}

                        {/* ── Sources — Perplexity-style ── */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">Sources</p>
                            <div className="flex flex-wrap gap-2">
                              {msg.sources.map((src, j) => (
                                <a key={j} href={src.url} target="_blank" rel="noopener noreferrer"
                                  className="source-card flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/80 hover:bg-white border border-zinc-200/60 hover:border-orange-200 group max-w-[260px] shadow-sm hover:shadow-md transition-all duration-200">
                                  <img src={src.favicon} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  <div className="min-w-0">
                                    <p className="text-[12px] text-zinc-700 group-hover:text-zinc-900 truncate font-medium leading-tight">{src.title}</p>
                                    <p className="text-[10px] text-zinc-400 group-hover:text-orange-500 truncate transition-colors">{src.domain}</p>
                                  </div>
                                  <span className="text-zinc-300 group-hover:text-zinc-400 flex-shrink-0 ml-1">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action buttons — like ChatGPT (copy, speak, etc.) */}
                        <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            onClick={(e) => {
                              navigator.clipboard.writeText(msg.content);
                              const btn = e.currentTarget;
                              btn.textContent = "✓";
                              btn.classList.add("text-emerald-500");
                              setTimeout(() => { btn.textContent = ""; btn.classList.remove("text-emerald-500"); btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; }, 1500);
                            }}
                            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors" title="Copy">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch("/api/tts", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ text: msg.content.slice(0, 1000), voiceId: currentVoiceIdRef.current }),
                                });
                                if (res.ok && audioRef.current) {
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  audioRef.current.src = url;
                                  audioRef.current.onended = () => URL.revokeObjectURL(url);
                                  speechSynthesis.cancel();
                                  audioRef.current.play();
                                }
                              } catch {}
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-150" title="Listen">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                          </button>
                        </div>

                        {/* Follow-up suggestions — clickable chips */}
                        {msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 && (
                          <div className="mt-4 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "300ms" }}>
                            {msg.suggestions.map((suggestion, j) => (
                              <button key={j} onClick={() => sendMessage(suggestion)}
                                className="px-3.5 py-1.5 rounded-full text-[12px] font-medium text-zinc-500 bg-white/80 hover:bg-orange-50 border border-zinc-200/60 hover:border-orange-300 hover:text-orange-600 transition-all duration-200 flex items-center gap-1.5 group shadow-sm hover:shadow-md hover:shadow-orange-100/50 backdrop-blur-sm">
                                <span className="text-zinc-400 group-hover:text-orange-500 transition-colors text-[11px]">→</span>
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* ── Live Browsing Panel — floating mini-window ── */}
              {isLoading && browsingActivities.length > 0 && showBrowsingPanel && (
                <div className="ml-8 mb-3 bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden max-w-[460px]" style={{ animation: "slideInUp 0.3s ease-out" }}>
                  {/* Browser Chrome — Manus-style */}
                  <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gradient-to-b from-zinc-100 to-zinc-50 border-b border-zinc-200">
                    <div className="flex gap-1.5 mr-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <div className="flex-1 flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1 border border-zinc-200 text-[11px] text-zinc-500">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <span className="truncate">{browsingActivities[browsingActivities.length - 1]?.url?.replace("search://", "🔍 ") || "MISSI Browser"}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 ml-1">{browsingActivities.filter(b => b.status === "done").length}/{browsingActivities.length}</span>
                    <button onClick={() => setShowBrowsingPanel(false)}
                      className="w-5 h-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors ml-1">
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

              {/* Live tool activity — clean status pills (no raw data) */}
              {isLoading && activeTools.length > 0 && (
                <div className="flex flex-wrap gap-1.5 ml-8 mb-2">
                  {activeTools.map((t, i) => {
                    const labels: Record<string, string> = {
                      web_search: "Searching the web", get_weather: "Checking weather",
                      get_time: "Getting time", calculate: "Calculating",
                      run_code: "Running code", read_webpage: "Reading page",
                      create_document: "Creating document", translate: "Translating",
                      analyze_data: "Analyzing", generate_code: "Writing code",
                      search_gmail: "Searching emails", read_gmail: "Reading email",
                      get_calendar: "Checking calendar", get_stock_price: "Fetching price",
                      get_crypto_price: "Checking crypto", wikipedia: "Looking up",
                      news_headlines: "Getting headlines", summarize_text: "Summarizing",
                      get_location: "Getting location", change_voice: "Changing voice",
                      set_reminder: "Setting reminder", unit_convert: "Converting",
                      define_word: "Looking up", random_fact: "Finding fact",
                      search_files: "Searching files",
                    };
                    return (
                      <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-300 ${
                        t.status === "running"
                          ? "bg-amber-50 text-amber-600 border border-amber-200/60 animate-pulse"
                          : "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                      }`} style={{ animationDelay: `${i * 50}ms` }}>
                        <span className="text-[11px]">{t.status === "running" ? "○" : "✓"}</span>
                        {labels[t.tool] || t.tool}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Loading indicator — skeleton + status */}
              {isLoading && !latestContent && (
                <div className="ml-8 py-2 animate-fade-in" role="status" aria-label="Loading response">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 flex items-center justify-center text-[10px] font-black text-white shadow-md shadow-orange-500/20">M</div>
                    <span className="text-[13px] font-semibold text-zinc-800">MISSI</span>
                    {thinkingStatus ? (
                      <span className="text-[12px] text-amber-500 font-medium animate-pulse">{thinkingStatus}</span>
                    ) : currentModel ? (
                      <span className="text-[12px] text-zinc-400">
                        {modelIcons[currentModel.model]} {currentModel.label} is thinking…
                      </span>
                    ) : (
                      <span className="text-[12px] text-zinc-400 animate-pulse">Routing to best model…</span>
                    )}
                  </div>
                  {activeTools.length === 0 && (
                    <div className="space-y-2.5 ml-8">
                      <div className="skeleton-shimmer h-3.5 rounded-md" style={{width: "78%"}} />
                      <div className="skeleton-shimmer h-3.5 rounded-md" style={{width: "62%", animationDelay: "0.15s"}} />
                      <div className="skeleton-shimmer h-3.5 rounded-md" style={{width: "45%", animationDelay: "0.3s"}} />
                    </div>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} className="h-1" />
            </div>
          </div>
        )}

        {/* ── BOTTOM INPUT ── */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-4 sm:py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="max-w-[720px] mx-auto px-1 sm:px-0">
            {/* Voice transcript */}
            {voiceState === "listening" && input && (
              <div className="mb-2.5 px-3.5 py-2.5 bg-white border border-orange-200/60 rounded-xl flex items-center gap-2.5 animate-fade-in shadow-sm">
                <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse shrink-0 voice-active" />
                <p className="text-[14px] text-zinc-700 italic flex-1 leading-relaxed">&quot;{input}&quot;</p>
              </div>
            )}

            {/* Stop button during generation (FIX #3) */}
            {isLoading && (
              <button onClick={stopGeneration} className="mb-2 mx-auto px-4 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-600 text-[12px] font-medium transition-all flex items-center gap-1.5 shadow-sm">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                Stop generating
              </button>
            )}
            <div className="input-container flex items-end gap-3 glass border border-zinc-200/60 rounded-[24px] px-5 py-3 shadow-xl shadow-zinc-200/30 transition-all duration-300">
              {/* Image upload */}
              <button onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all flex-shrink-0 touch-manipulation" title="Upload image (Pixtral)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </button>
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />

              {/* Text input */}
              <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} disabled={isLoading}
                value={input}
                onChange={(e) => { setInput(e.target.value); (e.target as HTMLTextAreaElement).style.height = "auto"; (e.target as HTMLTextAreaElement).style.height = Math.min((e.target as HTMLTextAreaElement).scrollHeight, 200) + "px"; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder={(() => {
                  const lang = sttLang.split("-")[0];
                  const placeholders: Record<string, string> = {
                    de: "Frag MISSI was du willst… oder drück Leertaste zum Sprechen",
                    en: "Ask MISSI anything… or press Space to talk",
                    fr: "Demandez à MISSI… ou appuyez sur Espace pour parler",
                    es: "Pregunta a MISSI… o pulsa Espacio para hablar",
                    it: "Chiedi a MISSI… o premi Spazio per parlare",
                    pt: "Pergunte ao MISSI… ou pressione Espaço para falar",
                    ja: "MISSIに聞いてみて… またはスペースで話す",
                    ko: "MISSI에게 물어보세요… 또는 스페이스를 눌러 말하기",
                    zh: "问MISSI… 或按空格键说话",
                  };
                  return placeholders[lang] || placeholders.en;
                })()}
                rows={1}
                className="flex-1 bg-transparent text-[16px] sm:text-[14px] text-zinc-800 placeholder:text-zinc-400 outline-none resize-none leading-relaxed min-h-[24px] max-h-[200px] overflow-y-auto py-0.5"
              />

              {/* Voice mini orb */}
              <div className="flex-shrink-0 cursor-pointer touch-manipulation" onClick={handleOrbClick} title="Voice (Space)">
                <VoiceOrb state={voiceState} audioLevel={audioLevel} size={30} />
              </div>

              {/* Send button */}
              <button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()}
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-900 disabled:from-zinc-200 disabled:to-zinc-200 disabled:text-zinc-400 text-white hover:from-zinc-700 hover:to-zinc-800 active:scale-[0.92] transition-all duration-150 flex-shrink-0 disabled:cursor-not-allowed shadow-sm disabled:shadow-none">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </div>

            <p className="text-[10px] text-zinc-400/50 text-center mt-3 font-medium">
              {({
                de: "Gebaut für den Mistral AI Worldwide Hackathon 2026 von MiMi Tech AI · 10.000+ Integrationen via Composio · 6 Mistral-Modelle",
                fr: "Construit pour le Mistral AI Worldwide Hackathon 2026 par MiMi Tech AI · 10 000+ intégrations via Composio · 6 modèles Mistral",
                es: "Construido para el Mistral AI Worldwide Hackathon 2026 por MiMi Tech AI · 10.000+ integraciones via Composio · 6 modelos Mistral",
                en: "Built for the Mistral AI Worldwide Hackathon 2026 by MiMi Tech AI · 10,000+ integrations via Composio · 6 Mistral models",
              } as Record<string, string>)[sttLang.split("-")[0]] || "Built for the Mistral AI Worldwide Hackathon 2026 by MiMi Tech AI · 10,000+ integrations via Composio · 6 Mistral models"}
            </p>
          </div>
        </div>
      </div>

      <audio ref={audioRef} crossOrigin="anonymous" />

      {/* ── Canvas Panel — fullscreen document/slide viewer ── */}
      {artifactPanel && (
        <div className="fixed inset-0 z-50 flex" style={{ animation: "fadeIn 0.2s ease-out" }}>
          {/* Backdrop */}
          <div className="flex-1 bg-black/30 backdrop-blur-md" onClick={() => setArtifactPanel(null)} />
          {/* Panel — wider for documents */}
          <div className="w-[720px] max-w-[95vw] h-full bg-white shadow-2xl flex flex-col border-l border-zinc-200" style={{ animation: "slideInRight 0.3s ease-out" }}>
            {/* Browser-style header with traffic lights */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 bg-gradient-to-b from-zinc-100 to-zinc-50">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <button onClick={() => setArtifactPanel(null)} className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors" title="Close" />
                  <span className="w-3 h-3 rounded-full bg-amber-400" />
                  <button onClick={() => {
                    const win = window.open("", "_blank");
                    if (win) { win.document.write(artifactPanel.content); win.document.close(); }
                  }} className="w-3 h-3 rounded-full bg-emerald-400 hover:bg-emerald-500 transition-colors" title="Open fullscreen" />
                </div>
                <div className="flex items-center gap-2 bg-white/80 rounded-lg px-3 py-1 border border-zinc-200 min-w-[200px]">
                  <span className="text-[10px] text-orange-500 font-bold">MISSI</span>
                  <span className="text-[12px] text-zinc-600 font-medium truncate">{artifactPanel.title}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { navigator.clipboard.writeText(artifactPanel.content); }}
                  className="px-2.5 py-1 rounded-md text-[11px] text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors font-medium" title="Copy">
                  📋 Copy
                </button>
                <button onClick={() => downloadDocument(artifactPanel as Document)}
                  className="px-2.5 py-1 rounded-md text-[11px] text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors font-medium" title="Download">
                  ⬇ Download
                </button>
              </div>
            </div>
            {/* Content — HTML renders live, Markdown with styling */}
            <div className="flex-1 overflow-hidden bg-white">
              {artifactPanel.content.includes("<!DOCTYPE html") || artifactPanel.content.includes("<html") || artifactPanel.content.includes("<h1") ? (
                <iframe
                  srcDoc={artifactPanel.content}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin allow-scripts"
                  title={artifactPanel.title}
                  style={{ minHeight: "100%" }}
                />
              ) : (
                <div className="px-8 py-6 overflow-y-auto h-full prose prose-zinc prose-sm max-w-none text-[14px] leading-[1.8] prose-headings:text-zinc-800 prose-headings:font-semibold prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-xl prose-pre:text-[13px] prose-a:text-orange-600">
                  <div className="max-w-2xl mx-auto w-full">
                    <ReactMarkdown>{artifactPanel.content}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}