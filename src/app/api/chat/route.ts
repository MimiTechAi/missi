import { Mistral } from "@mistralai/mistralai";

// Composio Tool Router Session — V3 API (correct approach per docs)
let _composioSessionId: string | null = null;

async function getComposioSession(): Promise<string | null> {
  if (_composioSessionId) return _composioSessionId;
  if (!process.env.COMPOSIO_API_KEY) return null;
  
  try {
    const res = await fetch("https://backend.composio.dev/api/v3/tool_router/session", {
      method: "POST",
      headers: { "x-api-key": process.env.COMPOSIO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "missi_demo_user",
        allowed_toolkits: ["gmail", "googlecalendar", "github", "slack", "notion"]
      })
    });
    const data = await res.json();
    _composioSessionId = data.session_id || null;
    return _composioSessionId;
  } catch (e) {
    console.error("[COMPOSIO] Session creation failed:", e);
    return null;
  }
}

async function composioExecute(toolName: string, _userId: string, params: Record<string, unknown>) {
  const sessionId = await getComposioSession();
  if (!sessionId) throw new Error("COMPOSIO_API_KEY not set or session creation failed");
  
  
  try {
    const res = await fetch(`https://backend.composio.dev/api/v3/tool_router/session/${sessionId}/execute`, {
      method: "POST",
      headers: { "x-api-key": process.env.COMPOSIO_API_KEY || "", "Content-Type": "application/json" },
      body: JSON.stringify({ tool_slug: toolName, arguments: params })
    });
    const result = await res.json();
    return result;
  } catch (e) {
    console.error("[COMPOSIO] Execute error:", e instanceof Error ? e.message : e);
    return { error: e instanceof Error ? e.message : "Composio execution failed", data: null };
  }
}
import { NextRequest } from "next/server";

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY || "",
});

// ============================================================
// MODEL ROUTER — Intelligent Multi-Model Selection
// ============================================================
type ModelRoute = {
  model: string;
  label: string;
  reason: string;
};

function routeModel(message: string, hasImage: boolean): ModelRoute {
  if (hasImage) {
    return {
      model: "pixtral-large-latest",
      label: "Pixtral Large",
      reason: "Vision analysis",
    };
  }

  const lower = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  // Code generation / debugging — Codestral specialist
  const codeKeywords = [
    "code", "function", "class", "debug", "refactor", "implement",
    "javascript", "python", "typescript", "rust", "html", "css",
    "algorithm", "regex", "api", "endpoint", "database", "sql",
    "git", "deploy", "docker", "compile", "syntax", "variable",
    "write a script", "write code", "fix this", "bug", "programmiere",
    "schreib.*code", "erstelle.*funktion", "programmier",
  ];
  if (codeKeywords.some((k) => lower.includes(k))) {
    return {
      model: "codestral-latest",
      label: "Codestral",
      reason: "Code specialist",
    };
  }

  // Deep reasoning / math / logic — Magistral (chain-of-thought reasoning model)
  const reasoningKeywords = [
    "reason", "think step by step", "prove", "derive", "theorem",
    "logic", "mathematical", "equation", "solve", "proof",
    "why does", "explain why", "how does.*work", "philosophy",
    "ethical", "dilemma", "paradox", "puzzle", "riddle",
    "warum", "erkläre warum", "beweise", "logisch", "mathematisch", "analyse",
    "compare", "evaluate", "trade-off", "pros and cons", "bewerte", "vergleiche",
    "schritt für schritt", "denk nach",
  ];
  if (reasoningKeywords.some((k) => lower.includes(k)) || (lower.includes("?") && wordCount > 30)) {
    return {
      model: "magistral-medium-latest",
      label: "Magistral",
      reason: "Deep reasoning",
    };
  }

  // Simple, fast queries — greetings, short acknowledgments
  const simplePatterns = [
    /^(hi|hey|hello|hallo|yo|ok|ja|nein|yes|no|danke|thanks|cool|nice|gut)\b/i,
    /^.{1,15}$/,
  ];
  if (simplePatterns.some((p) => p.test(message.trim())) && wordCount <= 5) {
    return {
      model: "mistral-small-latest",
      label: "Mistral Small",
      reason: "Quick response",
    };
  }

  // Creative writing — Creative model
  const creativeKeywords = [
    "story", "poem", "creative", "fiction", "imagine", "fantasy",
    "write me a", "compose", "narrative", "gedicht", "geschichte",
    "schreib mir", "erzähl", "kreativ", "song", "lyrics", "haiku", "märchen", "fabel",
    "write about", "describe a", "paint a picture", "novel",
    "dialogue", "monologue", "speech", "toast", "rede",
  ];
  if (creativeKeywords.some((k) => lower.includes(k))) {
    return {
      model: "mistral-medium-latest",
      label: "Mistral Medium",
      reason: "Creative generation",
    };
  }

  // Default: Mistral Large for best quality
  return {
    model: "mistral-large-latest",
    label: "Mistral Large",
    reason: "Best quality",
  };
}

// ============================================================
// AUTONOMOUS PLANNER — Multi-Step Task Decomposition
// ============================================================
async function createPlan(userMessage: string): Promise<string[] | null> {
  const lower = userMessage.toLowerCase();
  const complexIndicators = [
    "research", "find and", "search and", "compare", "create a report",
    "analyze and", "look up", "then", "step by step", "and also",
    "summarize", "and create", "and write", "and send", "and make",
  ];

  const isComplex = complexIndicators.some((k) => lower.includes(k)) || 
    (lower.includes("and") && userMessage.length > 60);

  // Don't plan for simple knowledge/lookup queries
  const simpleQueryPatterns = [
    /^(tell me|what is|who is|explain|define|describe|was ist|wer ist|erkläre)/i,
    /^(how to|wie kann|wie geht)/i,
  ];
  const isSimple = simpleQueryPatterns.some(p => p.test(userMessage.trim())) && userMessage.length < 80;

  if (!isComplex || isSimple) return null;

  try {
    const planResponse = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        {
          role: "system",
          content: `You are MISSI's task planner. Break complex requests into 2-5 concrete execution steps.
Available tools: web_search, read_webpage, get_weather, get_time, calculate, run_code, create_document, translate, analyze_data, generate_code, summarize_text, search_gmail, get_calendar, get_stock_price, get_crypto_price, wikipedia, news_headlines, unit_convert, define_word, random_fact, analyze_document, generate_chart.
Rules: Each step = one tool call. Include search_gmail and get_calendar when relevant. Be specific about tool names.
IMPORTANT: If the user asks for a report, summary, or document, ALWAYS include "Create a document with the findings" as the LAST step.
Return ONLY a JSON array of step descriptions. No markdown, no explanation.
Respond in the SAME LANGUAGE as the user's request.
Example: ["Search for X", "Read top 3 results", "Create comparison document"]
If the task is simple (1 step), return null.`,
        },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
    });

    const planText = String(planResponse.choices?.[0]?.message?.content || "");
    const match = planText.match(/\[[\s\S]*\]/);
    if (match) {
      const steps = JSON.parse(match[0]);
      if (Array.isArray(steps) && steps.length >= 2) return steps;
    }
  } catch {
    // Planning failed, proceed without plan
  }
  return null;
}

// ============================================================
// EXPANDED TOOL DEFINITIONS (27 Tools)
// ============================================================
const tools = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the internet for current information, news, or any topic. Returns top results with titles and snippets.",
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const, description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get current weather conditions and forecast for any location worldwide",
      parameters: {
        type: "object" as const,
        properties: {
          location: { type: "string" as const, description: "City name, e.g. 'Paris' or 'Tokyo'" },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_time",
      description: "Get the current date, time, and day of week in any timezone",
      parameters: {
        type: "object" as const,
        properties: {
          timezone: { type: "string" as const, description: "IANA timezone like 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calculate",
      description: "Perform mathematical calculations, unit conversions, or statistical computations",
      parameters: {
        type: "object" as const,
        properties: {
          expression: { type: "string" as const, description: "Math expression, e.g. '(15 * 0.18) + 15' or 'Math.sqrt(144)'" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_code",
      description: "Execute JavaScript code to solve problems, process data, generate outputs, or perform complex computations",
      parameters: {
        type: "object" as const,
        properties: {
          code: { type: "string" as const, description: "JavaScript code to execute. Use 'return' for output." },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_webpage",
      description: "Fetch and extract the main text content from any URL. Works with news articles, documentation, blogs, etc.",
      parameters: {
        type: "object" as const,
        properties: {
          url: { type: "string" as const, description: "Full URL to fetch, e.g. 'https://example.com'" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_document",
      description: "Create a structured document (report, summary, analysis, plan). Returns formatted markdown content that the user can download.",
      parameters: {
        type: "object" as const,
        properties: {
          title: { type: "string" as const, description: "Document title" },
          content: { type: "string" as const, description: "Full document content in markdown format" },
          type: { type: "string" as const, description: "Document type: 'report', 'summary', 'analysis', 'plan', 'email', 'article'" },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "translate",
      description: "Translate text between any languages",
      parameters: {
        type: "object" as const,
        properties: {
          text: { type: "string" as const, description: "Text to translate" },
          to: { type: "string" as const, description: "Target language, e.g. 'French', 'German', 'Japanese'" },
          from: { type: "string" as const, description: "Source language (auto-detected if not specified)" },
        },
        required: ["text", "to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_data",
      description: "Analyze numerical data, create statistics, find patterns, or generate insights from structured data",
      parameters: {
        type: "object" as const,
        properties: {
          data: { type: "string" as const, description: "Data to analyze (JSON, CSV, or plain text with numbers)" },
          question: { type: "string" as const, description: "What to analyze or find in the data" },
        },
        required: ["data", "question"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_code",
      description: "Generate production-quality code in any programming language with explanations",
      parameters: {
        type: "object" as const,
        properties: {
          description: { type: "string" as const, description: "What the code should do" },
          language: { type: "string" as const, description: "Programming language: 'python', 'javascript', 'typescript', 'rust', 'go', etc." },
        },
        required: ["description", "language"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_reminder",
      description: "Set a reminder or note for the user to remember something",
      parameters: {
        type: "object" as const,
        properties: {
          message: { type: "string" as const, description: "Reminder message" },
          time: { type: "string" as const, description: "When to remind, e.g. 'in 10 minutes', 'tomorrow at 9am'" },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "summarize_text",
      description: "Create a concise summary of long text, articles, or documents. Supports bullet points or paragraph format.",
      parameters: {
        type: "object" as const,
        properties: {
          text: { type: "string" as const, description: "Long text to summarize" },
          format: { type: "string" as const, description: "'bullets' for bullet points, 'paragraph' for prose summary" },
          max_length: { type: "string" as const, description: "Target length: 'short' (2-3 sentences), 'medium' (paragraph), 'long' (detailed)" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_gmail",
      description: "Search the user's Gmail inbox. Only available when the user has connected their Gmail account. Use for checking emails, finding messages, checking unread mail.",
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const, description: "Gmail search query, e.g. 'is:unread', 'from:boss@company.com', 'subject:invoice', 'newer_than:1d'" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_gmail",
      description: "Read a specific Gmail message by ID. Only available when the user has connected their Gmail account.",
      parameters: {
        type: "object" as const,
        properties: {
          messageId: { type: "string" as const, description: "Gmail message ID from search results" },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_files",
      description: "Search through the user's local files. Only available when the user has granted folder access. Use for finding documents, checking file contents, or browsing the user's computer.",
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const, description: "Search query — matches file names and content" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_calendar",
      description: "Get upcoming calendar events from Google Calendar. Only available when user has connected their Google account.",
      parameters: {
        type: "object" as const,
        properties: {
          days: { type: "string" as const, description: "Number of days to look ahead, default '1' for today" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_stock_price",
      description: "Get current stock price and daily change for any publicly traded company",
      parameters: {
        type: "object" as const,
        properties: {
          symbol: { type: "string" as const, description: "Stock ticker symbol, e.g. 'TSLA', 'AAPL', 'GOOGL', 'MSFT'" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_crypto_price",
      description: "Get current cryptocurrency price in USD and EUR",
      parameters: {
        type: "object" as const,
        properties: {
          coin: { type: "string" as const, description: "Cryptocurrency id, e.g. 'bitcoin', 'ethereum', 'solana', 'dogecoin'" },
        },
        required: ["coin"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "wikipedia",
      description: "Search Wikipedia and get a summary of any topic. Great for factual knowledge questions.",
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const, description: "Topic to search on Wikipedia" },
          lang: { type: "string" as const, description: "Language code: 'en', 'de', 'fr', 'es', 'ja'. Default 'en'" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_location",
      description: "Get the user's current geographic location (city, country, coordinates). Only available when user has granted location permission.",
      parameters: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "change_voice",
      description: "Change MISSI's speaking voice. Available voices: 'sarah' (default warm female), 'aria' (bright female), 'rachel' (calm female), 'eric' (smooth male), 'roger' (deep male), 'charlie' (british male)",
      parameters: {
        type: "object" as const,
        properties: {
          voice: { type: "string" as const, description: "Voice name: 'sarah', 'aria', 'rachel', 'eric', 'roger', 'charlie'" },
        },
        required: ["voice"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "news_headlines",
      description: "Get the latest top news headlines worldwide or by country/category. Perfect for 'what's happening today', 'latest news', 'Nachrichten', 'actualités'",
      parameters: {
        type: "object" as const,
        properties: {
          topic: { type: "string" as const, description: "News topic or category, e.g. 'technology', 'sports', 'politics', 'business', 'science', or a specific topic like 'AI'" },
          country: { type: "string" as const, description: "Country code: 'us', 'de', 'fr', 'gb', 'jp'. Default: international" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "unit_convert",
      description: "Convert between units: temperature (C/F/K), length (km/miles/meters/feet), weight (kg/lbs/oz), volume (liters/gallons), speed (km/h to mph), data (MB/GB/TB), currency hints",
      parameters: {
        type: "object" as const,
        properties: {
          value: { type: "string" as const, description: "Numeric value to convert, e.g. '100'" },
          from: { type: "string" as const, description: "Source unit, e.g. 'celsius', 'km', 'kg', 'liters'" },
          to: { type: "string" as const, description: "Target unit, e.g. 'fahrenheit', 'miles', 'lbs', 'gallons'" },
        },
        required: ["value", "from", "to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "define_word",
      description: "Get the definition, etymology, synonyms, and usage examples for any English word",
      parameters: {
        type: "object" as const,
        properties: {
          word: { type: "string" as const, description: "Word to define" },
        },
        required: ["word"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "random_fact",
      description: "Get a random interesting fact or trivia. Great for 'tell me something interesting', 'fun fact', 'wusstest du'",
      parameters: {
        type: "object" as const,
        properties: {
          category: { type: "string" as const, description: "Category: 'science', 'history', 'nature', 'space', 'technology', 'random'" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_document",
      description: "Analyze PDFs, images, or scanned documents using OCR. Extract text, tables, and structure. Can answer questions about document content.",
      parameters: {
        type: "object" as const,
        properties: {
          url: { type: "string" as const, description: "URL of the document or image to analyze" },
          query: { type: "string" as const, description: "Optional: specific question about the document" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_chart",
      description: "Generate a visual chart or graph from data. Supports bar, line, pie, area, and scatter charts. Returns inline SVG visualization.",
      parameters: {
        type: "object" as const,
        properties: {
          type: { type: "string" as const, description: "Chart type: bar, line, pie, area, scatter" },
          title: { type: "string" as const, description: "Chart title" },
          labels: { type: "string" as const, description: "Comma-separated labels (x-axis or categories)" },
          values: { type: "string" as const, description: "Comma-separated numeric values" },
          colors: { type: "string" as const, description: "Optional: comma-separated hex colors (#f97316,#3b82f6)" },
        },
        required: ["type", "title", "labels", "values"],
      },
    },
  },
];

// ============================================================
// TOOL EXECUTION ENGINE
// ============================================================

// Helper to execute Composio tools directly
// composioExecute removed — integrated into executePermissionTool

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case "web_search": {
      // Primary: DuckDuckGo (fast, 3-5s) with Mistral Conversations API as enrichment
      try {
        // Step 1: Fast DuckDuckGo results
        const ddgRes = await fetch(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`,
          { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
        );
        const html = await ddgRes.text();
        const resultBlocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>/g) || [];
        const extracted: string[] = [];
        for (const block of resultBlocks.slice(0, 8)) {
          const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
          const urlMatch = block.match(/href="([^"]*?)"/);
          const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/[a-z]/);
          const title = titleMatch?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
          const url = urlMatch?.[1] || "";
          const snippet = snippetMatch?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
          if (title) extracted.push(`• **${title}**${snippet ? `\n  ${snippet}` : ""}${url ? `\n  🔗 ${url}` : ""}`);
        }
        if (extracted.length > 0) {
          return `🔍 Search results for "${args.query}":\n\n${extracted.join("\n\n")}`;
        }
      } catch { /* DuckDuckGo failed, try Mistral */ }
      
      // Fallback: Mistral Conversations API (slower but richer)
      try {
        const searchResponse = await mistral.beta.conversations.start({
          model: "mistral-large-latest",
          inputs: `Search the web for: ${args.query}. Return the top results with titles, snippets, and URLs.`,
          tools: [{ type: "web_search" as const }],
          store: false,
        });
        
        const results: string[] = [];
        const refs: string[] = [];
        
        function extractText(obj: unknown): void {
          if (!obj) return;
          if (typeof obj === "string") { results.push(obj); return; }
          if (Array.isArray(obj)) { obj.forEach(extractText); return; }
          if (typeof obj === "object") {
            const o = obj as Record<string, unknown>;
            if (typeof o.text === "string" && o.text.length > 2) results.push(o.text);
            if (typeof o.url === "string" && o.type === "tool_reference") {
              refs.push(`🔗 [${o.title || o.url}](${o.url})`);
            }
            if (Array.isArray(o.content)) extractText(o.content);
            if (Array.isArray(o.outputs)) extractText(o.outputs);
          }
        }
        
        extractText(searchResponse.outputs || []);
        
        if (results.length > 0) {
          const combined = results.join("\n");
          const refsStr = refs.length > 0 ? `\n\n**Sources:**\n${refs.join("\n")}` : "";
          return `🔍 Search results for "${args.query}":\n\n${combined}${refsStr}`;
        }
      } catch { /* Both failed */ }
      
      return `No results found for "${args.query}". Try rephrasing your query.`;
    }

    case "get_weather": {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1`
        );
        const geo = await geoRes.json();
        if (!geo.results?.[0]) return `Location "${args.location}" not found.`;
        const { latitude, longitude, name: city, country } = geo.results[0];
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,weather_code,precipitation,uv_index&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,weather_code&timezone=auto&forecast_days=3`
        );
        const weather = await weatherRes.json();
        const c = weather.current;
        const d = weather.daily;
        const weatherCodes: Record<number, string> = {
          0: "Clear sky ☀️", 1: "Mainly clear 🌤️", 2: "Partly cloudy ⛅", 3: "Overcast ☁️",
          45: "Foggy 🌫️", 48: "Rime fog 🌫️", 51: "Light drizzle 🌧️", 53: "Drizzle 🌧️",
          55: "Dense drizzle 🌧️", 61: "Light rain 🌧️", 63: "Moderate rain 🌧️",
          65: "Heavy rain 🌧️", 71: "Light snow ❄️", 73: "Moderate snow ❄️", 75: "Heavy snow ❄️",
          80: "Rain showers 🌦️", 81: "Moderate showers 🌦️", 82: "Heavy showers 🌧️",
          85: "Snow showers 🌨️", 95: "Thunderstorm ⛈️", 96: "Thunderstorm + hail ⛈️",
        };
        const windDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        const windDir = windDirections[Math.round(c.wind_direction_10m / 45) % 8];
        const condition = weatherCodes[c.weather_code] || `Code ${c.weather_code}`;
        const uvLevel = c.uv_index > 8 ? "🔴 Very High" : c.uv_index > 5 ? "🟠 High" : c.uv_index > 2 ? "🟡 Moderate" : "🟢 Low";
        
        const forecastLines = d.temperature_2m_min.map((_: number, i: number) => {
          const dayLabel = i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(d.time[i]).toLocaleDateString("en", {weekday: "short"});
          const dayCondition = weatherCodes[d.weather_code[i]] || "";
          const rain = d.precipitation_sum[i] > 0 ? ` 🌧️ ${d.precipitation_sum[i]}mm` : "";
          return `• ${dayLabel}: ${d.temperature_2m_min[i]}°–${d.temperature_2m_max[i]}°C ${dayCondition}${rain}`;
        }).join("\n");
        
        return `**Weather in ${city}, ${country}:**\n🌡️ ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C)\n${condition}\n💨 Wind: ${c.wind_speed_10m} km/h ${windDir}\n💧 Humidity: ${c.relative_humidity_2m}%\n🌧️ Precipitation: ${c.precipitation} mm\n☀️ UV Index: ${c.uv_index} — ${uvLevel}\n\n**3-Day Forecast:**\n${forecastLines}\n\n🌅 Sunrise: ${d.sunrise[0].split("T")[1]} | 🌇 Sunset: ${d.sunset[0].split("T")[1]}`;
      } catch {
        return "Weather data is temporarily unavailable. Please try again in a moment.";
      }
    }

    case "get_time": {
      const tz = args.timezone || "UTC";
      try {
        const now = new Date();
        const formatted = now.toLocaleString("en-US", {
          timeZone: tz,
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        });
        return `${formatted}`;
      } catch {
        return `Current UTC time: ${new Date().toISOString()}`;
      }
    }

    case "calculate": {
      try {
        const result = new Function(`"use strict"; return (${args.expression})`)();
        return `Result: ${result}`;
      } catch (e) {
        return `Calculation error: ${e}`;
      }
    }

    case "run_code": {
      try {
        // Security: block dangerous APIs in sandboxed execution
        const blocked = ["fetch(", "require(", "import(", "process.", "XMLHttp", "WebSocket", "eval(", "Function("];
        for (const b of blocked) {
          if (args.code.includes(b)) return `⚠️ Security: \`${b}\` is not allowed in sandboxed execution.`;
        }
        
        // Detect language
        const lang = (args.language || "").toLowerCase();
        const isPython = lang === "python" || lang === "py" || 
          args.code.includes("print(") || args.code.includes("def ") || 
          args.code.includes("import ") || args.code.includes("for ") && args.code.includes("in range");
        
        if (isPython) {
          // Translate common Python patterns to JavaScript for sandboxed execution
          const jsCode = args.code
            .replace(/^print\((.*)\)$/gm, "console.log($1)")
            .replace(/^(\s+)print\((.*)\)$/gm, "$1console.log($2)")
            .replace(/def (\w+)\((.*?)\):/g, "function $1($2) {")
            .replace(/elif /g, "} else if (")
            .replace(/else:/g, "} else {")
            .replace(/if (.+):/g, "if ($1) {")
            .replace(/for (\w+) in range\((\d+)\):/g, "for (let $1 = 0; $1 < $2; $1++) {")
            .replace(/for (\w+) in range\((\d+),\s*(\d+)\):/g, "for (let $1 = $2; $1 < $3; $1++) {")
            .replace(/True/g, "true")
            .replace(/False/g, "false")
            .replace(/None/g, "null")
            .replace(/len\(/g, "((x) => x.length)(")
            .replace(/#(.*)$/gm, "// $1")
            .replace(/sum\(range\((\d+),\s*(\d+)\)\)/g, "Array.from({length: $2 - $1}, (_, i) => i + $1).reduce((a, b) => a + b, 0)");
          
          // Capture console.log output
          const logs: string[] = [];
          const mockConsole = { log: (...a: unknown[]) => logs.push(a.map(String).join(" ")) };
          const fn = new Function("console", `"use strict"; ${jsCode}`);
          const result = fn(mockConsole);
          const output = logs.length > 0 ? logs.join("\n") : (result !== undefined ? String(result) : "Done (no output)");
          return `\`\`\`\n${output}\n\`\`\``;
        }
        
        // JavaScript execution with console.log capture
        const logs: string[] = [];
        const mockConsole = { log: (...a: unknown[]) => logs.push(a.map(String).join(" ")) };
        const fn = new Function("console", `"use strict"; const fetch=undefined,require=undefined,process=undefined; ${args.code}`);
        const result = fn(mockConsole);
        const output = logs.length > 0 ? logs.join("\n") : (result !== undefined ? JSON.stringify(result, null, 2) : "Done (no output)");
        return `\`\`\`\n${output}\n\`\`\``;
      } catch (e) {
        return `❌ Execution error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "read_webpage": {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(args.url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; MissiBot/1.0)",
            Accept: "text/html,application/xhtml+xml",
          },
        });
        clearTimeout(timeout);
        const html = await res.text();
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
          .replace(/<[^>]*>/g, " ")
          .replace(/&[a-z]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 4000);
        return text || "Could not extract content from this page.";
      } catch (e) {
        return `Failed to fetch URL: ${e instanceof Error ? e.message : "timeout"}`;
      }
    }

    case "create_document": {
      const docType = args.type || "document";
      const styledContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${args.title || "Document"}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',-apple-system,sans-serif;line-height:1.7;color:#1a1a1a;max-width:800px;margin:0 auto;padding:48px 32px;background:#fafafa}h1{font-size:28px;font-weight:700;margin-bottom:8px;color:#111}h2{font-size:20px;font-weight:600;margin-top:32px;margin-bottom:12px;color:#222;border-bottom:2px solid #f97316;padding-bottom:4px;display:inline-block}h3{font-size:16px;font-weight:600;margin-top:24px;margin-bottom:8px}p{margin-bottom:16px}ul,ol{margin-bottom:16px;padding-left:24px}li{margin-bottom:6px}table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#f97316;color:white;padding:10px 14px;text-align:left;font-size:13px;text-transform:uppercase}td{padding:10px 14px;border-bottom:1px solid #eee}tr:nth-child(even){background:#f9f9f9}blockquote{border-left:3px solid #f97316;padding-left:16px;margin:16px 0;color:#555}code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px}pre{background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;overflow-x:auto;margin:16px 0}.header{border-bottom:3px solid #f97316;padding-bottom:16px;margin-bottom:32px}.meta{color:#888;font-size:13px;margin-top:4px}.footer{margin-top:48px;padding-top:16px;border-top:1px solid #ddd;color:#aaa;font-size:12px;text-align:center}</style></head><body>
<div class="header"><h1>${args.title || "Document"}</h1><p class="meta">Generated by MISSI · ${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})} · MiMi Tech AI</p></div>
${args.content}
<div class="footer"><p>Generated by MISSI — Powered by Mistral AI · MiMi Tech AI © ${new Date().getFullYear()}</p></div></body></html>`;
      return JSON.stringify({
        _type: "document",
        title: args.title,
        docType,
        content: styledContent,
        createdAt: new Date().toISOString(),
      });
    }

    case "translate": {
      try {
        const res = await mistral.chat.complete({
          model: "mistral-small-latest",
          messages: [
            {
              role: "system",
              content: `Translate the following text to ${args.to}. Return ONLY the translation, nothing else.`,
            },
            { role: "user", content: args.text },
          ],
          temperature: 0.1,
        });
        return String(res.choices?.[0]?.message?.content || "Translation failed.");
      } catch {
        return "Translation service unavailable.";
      }
    }

    case "analyze_data": {
      try {
        const res = await mistral.chat.complete({
          model: "mistral-large-latest",
          messages: [
            {
              role: "system",
              content: "You are a data analyst. Analyze the provided data and answer the question. Be precise and quantitative.",
            },
            { role: "user", content: `Data:\n${args.data}\n\nQuestion: ${args.question}` },
          ],
          temperature: 0.2,
        });
        return String(res.choices?.[0]?.message?.content || "Analysis failed.");
      } catch {
        return "Data analysis failed.";
      }
    }

    case "generate_code": {
      try {
        const res = await mistral.chat.complete({
          model: "codestral-latest",
          messages: [
            {
              role: "system",
              content: `You are an expert ${args.language} developer. Generate clean, production-quality code with brief comments. Return ONLY the code block.`,
            },
            { role: "user", content: args.description },
          ],
          temperature: 0.2,
        });
        return String(res.choices?.[0]?.message?.content || "Code generation failed.");
      } catch {
        return "Code generation service unavailable.";
      }
    }

    case "set_reminder": {
      return JSON.stringify({
        _type: "reminder",
        message: args.message,
        time: args.time || "now",
        setAt: new Date().toISOString(),
      });
    }

    case "summarize_text": {
      try {
        const format = args.format === "bullets" ? "bullet points" : "a concise paragraph";
        const length = args.max_length || "medium";
        const res = await mistral.chat.complete({
          model: "mistral-large-latest",
          messages: [
            {
              role: "system",
              content: `Summarize the following text as ${format}. Length: ${length}. Be precise and capture key points.`,
            },
            { role: "user", content: args.text },
          ],
          temperature: 0.2,
        });
        return String(res.choices?.[0]?.message?.content || "Summarization failed.");
      } catch {
        return "Summarization failed.";
      }
    }

    case "get_stock_price": {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(args.symbol)}?interval=1d&range=5d`
        );
        const data = await res.json();
        const meta = data.chart?.result?.[0]?.meta;
        if (!meta) return `Stock symbol "${args.symbol}" not found. Try common tickers like TSLA, AAPL, GOOGL, MSFT, AMZN, NVDA.`;
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose;
        const change = ((price - prevClose) / prevClose * 100).toFixed(2);
        const direction = Number(change) >= 0 ? "📈" : "📉";
        const marketState = meta.exchangeName || "NYSE";
        const dayHigh = meta.regularMarketDayHigh || price;
        const dayLow = meta.regularMarketDayLow || price;
        const fiftyTwoHigh = meta.fiftyTwoWeekHigh;
        const fiftyTwoLow = meta.fiftyTwoWeekLow;
        return `${direction} **${args.symbol.toUpperCase()}** — $${price.toFixed(2)} (${Number(change) >= 0 ? "+" : ""}${change}%)\n\n📊 Previous close: $${prevClose.toFixed(2)}\n📉 Day range: $${dayLow?.toFixed(2)} – $${dayHigh?.toFixed(2)}${fiftyTwoHigh ? `\n📅 52-week range: $${fiftyTwoLow?.toFixed(2)} – $${fiftyTwoHigh?.toFixed(2)}` : ""}\n🏛️ Exchange: ${marketState}\n💱 Currency: ${meta.currency}`;
      } catch {
        return `Could not fetch stock price for ${args.symbol}. The market may be closed.`;
      }
    }

    case "get_crypto_price": {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(args.coin)}&vs_currencies=usd,eur&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`
        );
        const data = await res.json();
        const coin = data[args.coin.toLowerCase()];
        if (!coin) return `Cryptocurrency "${args.coin}" not found. Try 'bitcoin', 'ethereum', 'solana', 'dogecoin', 'cardano'.`;
        const change = coin.usd_24h_change?.toFixed(2) || "N/A";
        const dir = Number(change) >= 0 ? "📈" : "📉";
        const name = args.coin.charAt(0).toUpperCase() + args.coin.slice(1);
        const marketCap = coin.usd_market_cap ? `$${(coin.usd_market_cap / 1e9).toFixed(2)}B` : "N/A";
        const volume = coin.usd_24h_vol ? `$${(coin.usd_24h_vol / 1e9).toFixed(2)}B` : "N/A";
        return `${dir} **${name}**\n\n💵 $${coin.usd?.toLocaleString()} USD\n💶 €${coin.eur?.toLocaleString()} EUR\n📊 24h change: ${Number(change) >= 0 ? "+" : ""}${change}%\n💰 Market cap: ${marketCap}\n📈 24h volume: ${volume}`;
      } catch {
        return `Could not fetch crypto price for ${args.coin}.`;
      }
    }

    case "wikipedia": {
      try {
        const lang = args.lang || "en";
        const res = await fetch(
          `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=true&explaintext=true&redirects=1&titles=${encodeURIComponent(args.query)}`
        );
        const data = await res.json();
        const pages = data.query?.pages;
        const page = Object.values(pages || {})[0] as { title?: string; extract?: string; missing?: boolean };
        if (!page || page.missing) return `No Wikipedia article found for "${args.query}".`;
        const extract = (page.extract || "").slice(0, 2000);
        return `📖 ${page.title}\n\n${extract}\n\nSource: https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(page.title))}`;
      } catch {
        return `Wikipedia search failed for "${args.query}".`;
      }
    }

    case "analyze_document": {
      if (!args.url) return "Please provide a URL to analyze.";
      try {
        const ocrRes = await mistral.chat.complete({
          model: "mistral-ocr-latest",
          messages: [
            { role: "user", content: [
              { type: "text", text: args.query || "Extract and summarize all text content from this document." },
              { type: "image_url", imageUrl: args.url },
            ]},
          ],
        });
        const text = typeof ocrRes.choices?.[0]?.message?.content === "string" 
          ? ocrRes.choices[0].message.content 
          : "Could not extract text from document.";
        return text.slice(0, 4000);
      } catch (e) {
        return `Document analysis failed: ${e instanceof Error ? e.message : "unknown error"}`;
      }
    }

    case "generate_chart": {
      const labels = (args.labels || "").split(",").map((l: string) => l.trim());
      const values = (args.values || "").split(",").map((v: string) => parseFloat(v.trim()));
      const colors = args.colors ? (args.colors as string).split(",").map((c: string) => c.trim()) : 
        ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#eab308", "#06b6d4", "#ef4444"];
      const chartType = args.type || "bar";
      const title = args.title || "Chart";
      const maxVal = Math.max(...values);
      
      let svg = "";
      if (chartType === "pie") {
        // Pie chart
        const total = values.reduce((a: number, b: number) => a + b, 0);
        let currentAngle = -90;
        const slices = values.map((v: number, i: number) => {
          const angle = (v / total) * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          currentAngle = endAngle;
          const startRad = (startAngle * Math.PI) / 180;
          const endRad = (endAngle * Math.PI) / 180;
          const x1 = 150 + 100 * Math.cos(startRad);
          const y1 = 150 + 100 * Math.sin(startRad);
          const x2 = 150 + 100 * Math.cos(endRad);
          const y2 = 150 + 100 * Math.sin(endRad);
          const largeArc = angle > 180 ? 1 : 0;
          return `<path d="M150,150 L${x1},${y1} A100,100 0 ${largeArc},1 ${x2},${y2} Z" fill="${colors[i % colors.length]}" opacity="0.85"/>`;
        }).join("");
        const legend = labels.map((l: string, i: number) => 
          `<text x="280" y="${30 + i * 22}" font-size="12" fill="#666"><tspan fill="${colors[i % colors.length]}">●</tspan> ${l}: ${values[i]} (${Math.round(values[i]/total*100)}%)</text>`
        ).join("");
        svg = `<svg viewBox="0 0 450 300" xmlns="http://www.w3.org/2000/svg"><text x="150" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#333">${title}</text>${slices}${legend}</svg>`;
      } else {
        // Bar/line chart
        const barW = Math.min(40, 280 / labels.length - 4);
        const bars = values.map((v: number, i: number) => {
          const h = (v / maxVal) * 180;
          const x = 50 + i * (280 / labels.length);
          if (chartType === "line" && i > 0) {
            const prevH = (values[i-1] / maxVal) * 180;
            const prevX = 50 + (i-1) * (280 / labels.length) + barW/2;
            return `<line x1="${prevX}" y1="${220-prevH}" x2="${x+barW/2}" y2="${220-h}" stroke="${colors[0]}" stroke-width="2.5"/><circle cx="${x+barW/2}" cy="${220-h}" r="4" fill="${colors[0]}"/>`;
          }
          return `<rect x="${x}" y="${220-h}" width="${barW}" height="${h}" rx="3" fill="${colors[i % colors.length]}" opacity="0.85"/><text x="${x+barW/2}" y="${215-h}" text-anchor="middle" font-size="10" fill="#666">${v}</text>`;
        }).join("");
        const xLabels = labels.map((l: string, i: number) => 
          `<text x="${50 + i * (280/labels.length) + barW/2}" y="240" text-anchor="middle" font-size="10" fill="#999">${l}</text>`
        ).join("");
        svg = `<svg viewBox="0 0 380 260" xmlns="http://www.w3.org/2000/svg"><text x="190" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#333">${title}</text><line x1="45" y1="220" x2="340" y2="220" stroke="#e5e5e5" stroke-width="1"/>${bars}${xLabels}</svg>`;
      }
      
      return JSON.stringify({ _type: "chart", title, chartType, svg, data: { labels, values } });
    }

        case "get_location": {
      // Location is passed from frontend via context
      return "Location must be provided by the browser. The user's location will be passed from the frontend.";
    }

    case "change_voice": {
      const voices: Record<string, { id: string; name: string }> = {
        sarah: { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Default — Warm Female)" },
        aria: { id: "9BWtsMINqrJLrRacOk9x", name: "Aria (Bright Female)" },
        rachel: { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Calm Female)" },
        eric: { id: "cjVigY5qzO86Huf0OWal", name: "Eric (Smooth Male)" },
        roger: { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger (Deep Male)" },
        charlie: { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie (British Male)" },
      };
      const v = voices[args.voice.toLowerCase()];
      if (!v) return `Unknown voice. Available: ${Object.keys(voices).join(", ")}`;
      return JSON.stringify({ _type: "voice_change", voiceId: v.id, voiceName: v.name });
    }

    case "news_headlines": {
      try {
        const topic = args.topic || "breaking news";
        const country = args.country || "";
        
        // Use multiple news sources for reliability
        const headlines: string[] = [];
        
        // Source 1: Google News RSS
        try {
          const lang = country === "de" ? "de" : country === "fr" ? "fr" : "en";
          const gl = country || "US";
          const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=${lang}&gl=${gl}&ceid=${gl}:${lang}`;
          const rssRes = await fetch(rssUrl, {
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          const rssText = await rssRes.text();
          const items = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
          for (const item of items.slice(0, 8)) {
            const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
            const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() || "";
            const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || "";
            const timeAgo = pubDate ? (() => {
              const diff = Date.now() - new Date(pubDate).getTime();
              const hours = Math.floor(diff / 3600000);
              return hours < 1 ? "just now" : hours < 24 ? `${hours}h ago` : `${Math.floor(hours/24)}d ago`;
            })() : "";
            if (title && title.length > 10) {
              headlines.push(`📰 **${title}**${source ? `\n   _${source}_` : ""}${timeAgo ? ` · ${timeAgo}` : ""}`);
            }
          }
        } catch { /* RSS failed, continue */ }
        
        if (headlines.length === 0) {
          // Fallback: DuckDuckGo HTML search
          const searchQuery = `${topic} news today`;
          const res = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
            { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }, signal: AbortSignal.timeout(8000) }
          );
          const html = await res.text();
          const blocks = html.match(/<a class="result__a"[^>]*>([\s\S]*?)<\/a>/g) || [];
          for (const block of blocks.slice(0, 8)) {
            const title = block.replace(/<[^>]*>/g, "").trim();
            if (title && title.length > 10) headlines.push(`📰 ${title}`);
          }
        }
        
        const label = topic.charAt(0).toUpperCase() + topic.slice(1);
        return headlines.length > 0
          ? `📰 **Top Headlines — ${label}**${country ? ` (${country.toUpperCase()})` : ""}:\n\n${headlines.join("\n\n")}`
          : `No news headlines found for "${topic}". Try a different topic or use web_search for broader results.`;
      } catch {
        return "News service temporarily unavailable. Try web_search as an alternative.";
      }
    }

    case "unit_convert": {
      const val = parseFloat(args.value);
      if (isNaN(val)) return `Invalid number: "${args.value}"`;
      const from = args.from.toLowerCase();
      const to = args.to.toLowerCase();

      const conversions: Record<string, Record<string, (v: number) => number>> = {
        celsius: { fahrenheit: v => v * 9/5 + 32, kelvin: v => v + 273.15 },
        fahrenheit: { celsius: v => (v - 32) * 5/9, kelvin: v => (v - 32) * 5/9 + 273.15 },
        kelvin: { celsius: v => v - 273.15, fahrenheit: v => (v - 273.15) * 9/5 + 32 },
        km: { miles: v => v * 0.621371, meters: v => v * 1000, feet: v => v * 3280.84 },
        miles: { km: v => v * 1.60934, meters: v => v * 1609.34, feet: v => v * 5280 },
        meters: { km: v => v / 1000, miles: v => v / 1609.34, feet: v => v * 3.28084, inches: v => v * 39.3701 },
        feet: { meters: v => v / 3.28084, km: v => v / 3280.84, miles: v => v / 5280, inches: v => v * 12 },
        kg: { lbs: v => v * 2.20462, oz: v => v * 35.274, grams: v => v * 1000 },
        lbs: { kg: v => v / 2.20462, oz: v => v * 16, grams: v => v * 453.592 },
        liters: { gallons: v => v * 0.264172, ml: v => v * 1000, cups: v => v * 4.22675 },
        gallons: { liters: v => v * 3.78541, ml: v => v * 3785.41, cups: v => v * 16 },
        "km/h": { mph: v => v * 0.621371, "m/s": v => v / 3.6 },
        mph: { "km/h": v => v * 1.60934, "m/s": v => v * 0.44704 },
        mb: { gb: v => v / 1024, tb: v => v / (1024 * 1024), kb: v => v * 1024 },
        gb: { mb: v => v * 1024, tb: v => v / 1024, kb: v => v * 1024 * 1024 },
        tb: { gb: v => v * 1024, mb: v => v * 1024 * 1024 },
      };

      const converter = conversions[from]?.[to];
      if (!converter) return `Cannot convert from "${from}" to "${to}". Supported: temperature (C/F/K), length (km/miles/m/ft), weight (kg/lbs), volume (liters/gallons), speed (km/h/mph), data (MB/GB/TB)`;
      const result = converter(val);
      return `🔄 ${val} ${from} = **${result.toFixed(4).replace(/\.?0+$/, "")} ${to}**`;
    }

    case "define_word": {
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args.word)}`);
        if (!res.ok) return `Word "${args.word}" not found in dictionary.`;
        const data = await res.json();
        const entry = data[0];
        const phonetic = entry.phonetics?.find((p: { text?: string }) => p.text)?.text || "";
        const meanings = entry.meanings?.slice(0, 3).map((m: { partOfSpeech: string; definitions: { definition: string; example?: string; synonyms?: string[] }[] }) => {
          const defs = m.definitions.slice(0, 2);
          return `**${m.partOfSpeech}**\n${defs.map((d: { definition: string; example?: string }, i: number) => 
            `  ${i + 1}. ${d.definition}${d.example ? `\n     _"${d.example}"_` : ""}`
          ).join("\n")}`;
        }).join("\n\n");
        const allSynonyms = entry.meanings?.flatMap((m: { definitions: { synonyms?: string[] }[] }) => 
          m.definitions.flatMap((d: { synonyms?: string[] }) => d.synonyms || [])
        ).slice(0, 8);
        return `📖 **${entry.word}** ${phonetic}\n\n${meanings}${allSynonyms?.length ? `\n\n**Synonyms:** ${allSynonyms.join(", ")}` : ""}`;
      } catch {
        return `Could not look up "${args.word}".`;
      }
    }

    case "random_fact": {
      try {
        const res = await mistral.chat.complete({
          model: "mistral-small-latest",
          messages: [
            {
              role: "system",
              content: `Generate one fascinating, lesser-known fact about ${args.category || "any topic"}. Make it specific with a surprising number, date, or detail. Format: Start with an emoji, then the fact. Keep it to 2-3 sentences.`,
            },
            { role: "user", content: "Tell me a random interesting fact." },
          ],
          temperature: 0.9,
        });
        return String(res.choices?.[0]?.message?.content || "Could not generate fact.");
      } catch {
        return "Fact generation failed.";
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// Permission-gated tool execution (needs external context from frontend)
async function executePermissionTool(name: string, args: Record<string, string>, context: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "search_gmail": {
      // Priority 1: Use direct Gmail API with OAuth token from frontend
      const gmailToken = context.gmailToken as string;
      if (gmailToken) {
        try {
          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(args.query || "is:unread")}&maxResults=5`,
            { headers: { Authorization: `Bearer ${gmailToken}` } }
          );
          const data = await res.json();
          if (res.status === 401) return "Gmail session expired. Please reconnect Gmail via the 📧 icon in the sidebar.";
          if (!data.messages?.length) return `No emails found for: "${args.query}"`;
          const results = [];
          for (const msg of data.messages.slice(0, 5)) {
            const detailRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${gmailToken}` } }
            );
            const detail = await detailRes.json();
            const headers = detail.payload?.headers || [];
            results.push(
              `📧 **${headers.find((h: {name: string}) => h.name === "Subject")?.value || "(no subject)"}**\n   From: ${headers.find((h: {name: string}) => h.name === "From")?.value || ""}\n   Date: ${headers.find((h: {name: string}) => h.name === "Date")?.value || ""}\n   Preview: ${(detail.snippet || "").slice(0, 150)}`
            );
          }
          return results.join("\n\n");
        } catch (e) {
          return `Gmail search error: ${e instanceof Error ? e.message : "unknown"}. Try reconnecting via sidebar.`;
        }
      }
      // Priority 2: Use Composio SDK (properly authenticated)
      if (!process.env.COMPOSIO_API_KEY) return "Gmail not connected. Click the 📧 icon in the sidebar to connect Gmail.";
      try {
        const data = await composioExecute("GMAIL_FETCH_EMAILS", "missi_demo_user", {
          query: args.query || "newer_than:7d",
          max_results: args.limit || 5,
        });
        // Handle various response formats
        const messages = data?.data?.messages || data?.data || [];
        if (!messages.length) return `No emails found for: "${args.query}".`;
        return messages.slice(0, 5).map((m: Record<string, string>, i: number) => {
          // Extract subject from messageText first line or subject field
          const lines = (m.messageText || "").split("\n").filter((l: string) => l.trim());
          const subject = m.subject || lines[0]?.substring(0, 80) || "(no subject)";
          const from = m.from || m.sender || "";
          // Clean preview — remove URLs, excessive whitespace
          const rawPreview = (m.snippet || m.messageText || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
          const preview = rawPreview.slice(0, 120);
          const labels = (m.labelIds || "").toString();
          const isUnread = labels.includes("UNREAD");
          const isImportant = labels.includes("IMPORTANT");
          
          return `${i + 1}. ${isUnread ? "🔵" : "📧"}${isImportant ? " ⭐" : ""} **${subject}**\n   From: ${from}\n   Preview: ${preview}`;
        }).join("\n\n");
      } catch (e) {
        return `Gmail search failed: ${e instanceof Error ? e.message : "unknown"}. Click 📧 in sidebar to connect.`;
      }
    }

    case "read_gmail": {
      // Priority 1: Direct Gmail API with OAuth token
      const readGmailToken = context.gmailToken as string;
      if (readGmailToken && (args.id || args.messageId)) {
        try {
          const msgId = args.id || args.messageId;
          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
            { headers: { Authorization: `Bearer ${readGmailToken}` } }
          );
          if (res.status === 401) return "Gmail session expired. Please reconnect via sidebar.";
          const detail = await res.json();
          let textBody = detail.snippet || "";
          const parts = detail.payload?.parts || [];
          for (const part of parts) {
            if (part.mimeType === "text/plain" && part.body?.data) {
              textBody = Buffer.from(part.body.data, "base64url").toString("utf8");
              break;
            }
          }
          const headers = detail.payload?.headers || [];
          return `📧 **${headers.find((h: {name: string}) => h.name === "Subject")?.value || "No subject"}**\nFrom: ${headers.find((h: {name: string}) => h.name === "From")?.value || "Unknown"}\nDate: ${headers.find((h: {name: string}) => h.name === "Date")?.value || ""}\n\n${textBody.slice(0, 3000)}`;
        } catch (e) {
          return `Gmail read error: ${e instanceof Error ? e.message : "unknown"}`;
        }
      }
      // Priority 2: Composio SDK
      if (!process.env.COMPOSIO_API_KEY) return "Gmail not connected. Click 📧 in sidebar to connect.";
      try {
        const data = await composioExecute("GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", "missi_demo_user", {
          message_id: args.id || args.messageId,
        });
        const email = data?.data || data;
        if (email) {
          return `📧 **${email.subject || "No subject"}**\nFrom: ${email.from || "Unknown"}\nDate: ${email.date || ""}\n\n${(email.body || email.snippet || "No content").slice(0, 3000)}`;
        }
        return "Could not read email. Make sure Gmail is connected via the sidebar.";
      } catch (e) {
        return `Gmail read failed: ${e instanceof Error ? e.message : "unknown"}. Connect via sidebar.`;
      }
    }

    case "search_files": {
      // Priority 1: Use local file index from frontend (user granted folder access)
      const fileIndex = context.fileIndex as string;
      if (fileIndex) {
        const files = fileIndex.split("\n").filter(Boolean);
        const query = (args.query || "").toLowerCase();
        const matches = files.filter(f => f.toLowerCase().includes(query));
        if (matches.length > 0) {
          return `📂 Found ${matches.length} matching file(s):\n\n${matches.slice(0, 15).map(f => `🗂️ ${f}`).join("\n")}${matches.length > 15 ? `\n\n... and ${matches.length - 15} more` : ""}`;
        }
        return `No local files matching "${args.query}" in the connected folder (${files.length} files indexed).`;
      }
      // Priority 2: Composio Google Drive (SDK)
      if (!process.env.COMPOSIO_API_KEY) return "No folder connected. Click the 📁 icon in the sidebar to grant folder access.";
      try {
        const data = await composioExecute("GOOGLEDRIVE_FIND_FILE", "missi_demo_user", {
          query: args.query, max_results: 10,
        });
        const files = data?.data || (Array.isArray(data) ? data : []);
        if (files.length) {
          return files.map((f: Record<string, string>) =>
            `🗂️ **${f.name || f.title}** (${f.mimeType || "file"})\n   📎 ${f.webViewLink || "No link"}`
          ).join("\n\n");
        }
        return `No files found for "${args.query}". Connect Google Drive via sidebar.`;
      } catch (e) {
        return `File search failed: ${e instanceof Error ? e.message : "unknown"}`;
      }
    }

    case "get_calendar": {
      if (!process.env.COMPOSIO_API_KEY) return "Calendar not configured.";
      try {
        const now = new Date();
        const data = await composioExecute("GOOGLECALENDAR_FIND_EVENT", "missi_demo_user", {
          time_min: now.toISOString(),
          max_results: 15,
        });
        if (data?.data?.event_data?.event_data) {
          const events = data.data.event_data.event_data;
          if (!events.length) return "📅 No upcoming events in the next " + (args.days || 7) + " days.";
          const now = new Date();
          // Format events with relative time
          return events.slice(0, 10).map((e: Record<string, unknown>) => {
            const startObj = e.start as Record<string, string> | undefined;
            const isAllDay = !startObj?.dateTime && !!startObj?.date;
            const startDT = startObj?.dateTime ? new Date(startObj.dateTime) : (startObj?.date ? new Date(startObj.date + "T00:00:00") : null);
            const endObj = e.end as Record<string, string> | undefined;
            const endDT = endObj?.dateTime ? new Date(endObj.dateTime) : (endObj?.date ? new Date(endObj.date + "T23:59:59") : null);
            
            // Relative time
            let timeLabel = "";
            if (startDT) {
              const diffMs = startDT.getTime() - now.getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              if (diffDays === 0 && diffHours >= 0) timeLabel = diffHours <= 1 ? "in " + Math.max(0, Math.floor(diffMs / 60000)) + " min" : "today";
              else if (diffDays === 1) timeLabel = "tomorrow";
              else if (diffDays > 1) timeLabel = "in " + diffDays + " days";
              else timeLabel = "past";
            }
            
            const dateStr = startDT ? startDT.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }) : "";
            const timeStr = isAllDay ? "ganztägig" : (startDT ? startDT.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
            const endTimeStr = isAllDay ? "" : (endDT ? endDT.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
            const duration = startDT && endDT && !isAllDay ? Math.round((endDT.getTime() - startDT.getTime()) / 60000) : 0;
            const daySpan = isAllDay && startDT && endDT ? Math.ceil((endDT.getTime() - startDT.getTime()) / (1000 * 60 * 60 * 24)) : 0;
            const durationStr = isAllDay ? (daySpan > 1 ? daySpan + " Tage" : "") : (duration > 0 ? (duration >= 60 ? Math.floor(duration / 60) + "h" + (duration % 60 > 0 ? " " + (duration % 60) + "min" : "") : duration + " min") : "");
            
            return `📅 **${e.summary || "Untitled"}** ${timeLabel ? "(" + timeLabel + ")" : ""}\n   🕐 ${dateStr} ${timeStr}${endTimeStr ? " – " + endTimeStr : ""}${durationStr ? " · " + durationStr : ""}${(e.location as string) ? "\n   📍 " + e.location : ""}${(e.attendees as Array<{email: string}> || []).length > 0 ? "\n   👥 " + (e.attendees as Array<{email: string}>).map(a => a.email?.split("@")[0]).join(", ") : ""}`;
          }).join("\n\n");
        }
        return "📅 Calendar not connected. Click 📅 in sidebar.";
      } catch {
        return "Calendar lookup failed. Connect via sidebar first.";
      }
    }

    
    case "get_location": {
      const loc = context.location as string;
      if (!loc) return "Location not available. The user needs to grant location permission in their browser.";
      return loc;
    }

    default:
      return `Unknown permission tool: ${name}`;
  }
}

// ============================================================
// SYSTEM PROMPT — Missi Personality
// ============================================================
// Dynamic system prompt with real-time context injection (Anthropic best practices 2026)
function buildSystemPrompt(): string {
  const now = new Date();
  const locale = "de-DE";
  const tz = "Europe/Berlin";
  const dateStr = now.toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz });
  const timeStr = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const isoDate = now.toISOString().split("T")[0];

  return `<identity>
You are MISSI — Mistral Intelligent Super System Interface — a voice-first AI operating system built for the Mistral AI Worldwide Hackathon 2026.
You are powered by Mistral AI's complete model ecosystem with intelligent multi-model routing across 6 specialized models — Large, Magistral, Medium, Codestral, Pixtral, and Small.
Magistral handles deep reasoning and mathematical proofs. Mistral Medium excels at creative writing.
Built by MiMi Tech AI (mimitechai.com) — a German AI company specializing in enterprise AI strategy, digital twins, and process automation.
</identity>

<environment>
Current date: ${dateStr}
Current time: ${timeStr} (Europe/Berlin, CET/CEST)
ISO date: ${isoDate}
Year: ${now.getFullYear()}
Day of week: ${now.toLocaleDateString("en-US", { weekday: "long", timeZone: tz })}
</environment>

<personality>
- Calm, confident, subtly witty — an intelligent companion, not a chatbot
- Lead with the key insight, then elaborate — never bury the answer
- Concise by default (2-4 sentences for simple queries), detailed when complexity demands it
- Proactive: suggest relevant follow-ups and anticipate needs
- Use specific numbers, dates, facts — never be vague when precision is available
- Dry humor when natural, never forced
- When introducing yourself: give a compelling 3-4 sentence overview (voice-first AI OS, 6 Mistral models, 27 tools + 10,000+ via Composio, multi-language), then demonstrate with 2-3 tool calls
</personality>

<language_rules>
CRITICAL: Detect the user's language from their message and ALWAYS respond in that SAME language.
- German input → German response
- English input → English response
- French input → French response
- Any language → match it
- Default to English only if language is ambiguous
Your TTS engine handles all languages natively.
Your responses will be read aloud by a text-to-speech engine, so:
- Never use ellipses (...) — the TTS cannot pronounce them
- Avoid excessive markdown in spoken responses
- Use natural sentence structure optimized for listening
- Keep spoken responses under 150 words unless the user asks for detail
</language_rules>

<tools>
You have 27 built-in tools PLUS 10,000+ external integrations via Composio.

ABSOLUTE RULE: ALWAYS use the appropriate tool. NEVER answer from memory when a tool exists for the task.
If the user asks about weather, time, stocks, news, or any real-time data — you MUST call the tool, even if you think you know the answer.

<tool_routing>
| User intent | Required tool | Notes |
|---|---|---|
| Weather, forecast, temperature | get_weather | Any city worldwide |
| Current time, timezone | get_time | Accepts city names |
| Stock price, market data | get_stock_price | Ticker symbols: TSLA, AAPL, etc. |
| Crypto price | get_crypto_price | bitcoin, ethereum, solana, etc. |
| Web search, news, current events | web_search | 8 results with URLs |
| Read URL, webpage content | read_webpage | Extracts clean text |
| Email search, inbox | search_gmail | Uses Composio Gmail connection |
| Read specific email | read_gmail | By message ID |
| Calendar events, schedule | get_calendar | Uses Composio Google Calendar |
| Calculate, math, convert | calculate | Financial calcs, unit conversion |
| Run/execute code | run_code | JavaScript execution |
| Read PDF/document | analyze_document | OCR via Mistral OCR model |
| Generate code | generate_code | Production-quality via Codestral |
| Create document/report | create_document | Downloadable HTML/Markdown |
| Translate text | translate | Any language pair |
| Wikipedia lookup | wikipedia | Any language |
| News headlines | news_headlines | By topic or country |
| Unit conversion | unit_convert | Temperature, length, weight, etc. |
| Dictionary definition | define_word | Definitions + synonyms |
| Summarize text | summarize_text | Long content → key points |
| Set reminder | set_reminder | Time-based reminders |
| Change voice | change_voice | sarah, aria, rachel, eric, roger, charlie |
| Random fact/trivia | random_fact | Interesting facts |
| Analyze data | analyze_data | Statistical analysis |
| Generate chart/graph | generate_chart | Bar, line, pie, area, scatter |
| Search files | search_files | Local file search |
| Get location | get_location | Browser GPS permission required |
</tool_routing>

<composio_integrations>
10,000+ external tools via Composio Tool Router. Key integrations:
- Gmail: search, read, send, draft, label management
- Google Calendar: list events, create events, find free slots
- GitHub: issues, PRs, repos, code search
- Slack: messages, channels, users
- Notion: pages, databases, search
- Google Drive: files, sharing
When a Composio tool returns an auth error, tell the user to click the corresponding icon in the left sidebar to connect.
</composio_integrations>
</tools>

<output_rules>
1. NEVER fabricate data. If a tool returned results, base your response ONLY on those results.
2. Quote specific data points from tool outputs (temperatures, prices, dates, names).
3. Format with Markdown: **bold** for key terms, ## headers for sections, bullet lists for clarity.
4. For multi-step research: web_search → read_webpage → analyze → create_document.
5. ALWAYS use create_document for reports, summaries, comparisons, or analyses.
6. After completing a task, suggest 1-2 natural follow-up actions.
7. When multiple tools are needed, state your brief plan, then execute all steps.
8. If a tool returns empty results, say "No results found" — never blame the connection.
9. Try tools first, suggest reconnection only on explicit auth errors.
</output_rules>`;
}

const SYSTEM_PROMPT = buildSystemPrompt();


// ============================================================
// MAIN API HANDLER — Server-Sent Events (SSE) Streaming
// ============================================================
export const maxDuration = 120; // 120s for multi-tool chains (Vercel Pro/Hobby max)

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  function sseEvent(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const { messages, image, permissions } = await req.json();
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    const hasImage = !!image;
    // Vision: auto-switch to pixtral for image analysis
    if (hasImage) {
    }
    // Permission context from frontend
    const permContext = {
      gmailToken: permissions?.gmailToken || "",
      fileIndex: permissions?.fileIndex || "",
      location: permissions?.location || "",
      composioConnected: permissions?.composioConnected || [],
      baseUrl: req.nextUrl.origin,
    };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 1. Model selection
          const route = routeModel(lastUserMsg, hasImage);
          controller.enqueue(sseEvent("model_selected", { ...route, startTime: Date.now() }));

          // 2. Planning
          const plan = await createPlan(lastUserMsg);
          if (plan) {
            controller.enqueue(sseEvent("plan", plan));
          }

          // 2b. Build connected-services context for the AI
          const connectedServices = [];
          if (permContext.gmailToken) connectedServices.push("Gmail (OAuth — user has authorized read access, use search_gmail/read_gmail tools)");
          if (Array.isArray(permContext.composioConnected) && permContext.composioConnected.length > 0) {
            for (const svc of permContext.composioConnected) connectedServices.push(svc + " (connected via Composio — ready to use)");
          }
          if (permContext.fileIndex) connectedServices.push("Local Files (folder access granted, use search_files tool)");
          if (permContext.location) connectedServices.push("Location: " + permContext.location);

          const servicesContext = "\n\n<connected_services>\n" + 
            "The following Composio integrations are ACTIVE and ready (server-side connections):\n" +
            "- Gmail (ACTIVE) — use search_gmail/read_gmail for email queries\n" +
            "- Google Calendar (ACTIVE) — use get_calendar for schedule queries\n" +
            "- GitHub (ACTIVE) — available for repo/issue/PR queries\n" +
            (connectedServices.length > 0 ? connectedServices.map(s => "- " + s).join("\n") + "\n" : "") +
            "RULES:\n" +
            "1. NEVER tell the user to connect or click sidebar icons for Gmail, Calendar, or GitHub — they ARE connected.\n" +
            "2. Call tools IMMEDIATELY when asked about emails, calendar, or repos.\n" +
            "3. Only suggest reconnection if a tool returns an explicit auth error.\n" +
            "</connected_services>";

          // 3. Build messages
          const fullMessages: Array<Record<string, unknown>> = [
            { role: "system", content: SYSTEM_PROMPT + servicesContext },
          ];
          for (const msg of messages.slice(0, -1)) {
            fullMessages.push({ role: msg.role, content: msg.content });
          }

          if (hasImage) {
            fullMessages.push({
              role: "user",
              content: [
                { type: "text", text: lastUserMsg || "What do you see in this image? Describe it in detail." },
                { type: "image_url", imageUrl: image },
              ],
            });
          } else if (plan) {
            fullMessages.push({
              role: "user",
              content: `${lastUserMsg}\n\n[INTERNAL PLAN — follow these steps:\n${plan.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}\n]`,
            });
          } else {
            fullMessages.push({ role: "user", content: lastUserMsg });
          }

          const useTools = !hasImage;

          // Retry wrapper (non-streaming, for tool calls)
          const callMistral = async (msgs: Array<Record<string, unknown>>) => {
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                return await mistral.chat.complete({
                  model: route.model,
                  messages: msgs as Parameters<typeof mistral.chat.complete>[0]["messages"],
                  ...(useTools ? { tools, toolChoice: "auto" as const } : {}),
                  temperature: 0.7,
                  maxTokens: 4096,
                });
              } catch (e: unknown) {
                const err = e as { statusCode?: number };
                if (err.statusCode === 429 && attempt < 2) {
                  await new Promise(r => setTimeout(r, (attempt + 1) * 3000 + 2000));
                  continue;
                }
                throw e;
              }
            }
            throw new Error("Max retries exceeded");
          };

          // Streaming wrapper (for final response — word-by-word like ChatGPT)
          const streamMistralFinal = async (msgs: Array<Record<string, unknown>>): Promise<string> => {
            let fullContent = "";
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const stream = await mistral.chat.stream({
                  model: route.model,
                  messages: msgs as Parameters<typeof mistral.chat.stream>[0]["messages"],
                  temperature: 0.7,
                });
                for await (const event of stream) {
                  const delta = event.data?.choices?.[0]?.delta;
                  if (delta?.content) {
                    // Handle both string and array content formats
                    const rawContent = delta.content;
                    const chunk = typeof rawContent === "string" ? rawContent 
                      : Array.isArray(rawContent) ? rawContent.map((c: {type?: string; text?: string}) => typeof c === "string" ? c : c.text || "").join("")
                      : String(rawContent);
                    if (!chunk || chunk === "[object Object]") continue; // Skip malformed chunks
                    fullContent += chunk;
                    controller.enqueue(sseEvent("content_delta", chunk));
                    // Adaptive streaming pace — fast start, smooth middle, speed up for long responses
                    const lastChar = chunk[chunk.length - 1];
                    const punctPause = lastChar === '.' || lastChar === '!' || lastChar === '?' ? 15 : lastChar === ',' || lastChar === ':' ? 8 : 0;
                    if (punctPause > 0) await new Promise(r => setTimeout(r, punctPause));
                  }
                }
                return fullContent;
              } catch (e: unknown) {
                const err = e as { statusCode?: number };
                if (err.statusCode === 429 && attempt < 2) {
                  await new Promise(r => setTimeout(r, (attempt + 1) * 3000 + 2000));
                  fullContent = "";
                  continue;
                }
                throw e;
              }
            }
            throw new Error("Max retries exceeded");
          };

          // 4. First LLM call
          controller.enqueue(sseEvent("status", "Thinking..."));
          let response = await callMistral(fullMessages);
          let assistantMessage = response!.choices?.[0]?.message;

          if (!assistantMessage || (!assistantMessage.content && (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0))) {
            controller.enqueue(sseEvent("content_delta", "I'm ready! I can search the web in real-time, check weather and stocks, generate code, create reports, translate in 10 languages, and connect to Gmail, Calendar, GitHub and 10,000+ more tools. Just ask or say \"Hey MISSI\" 🎤"));
            controller.enqueue(sseEvent("done", { toolResults: [], documents: [], usage: { totalRounds: 0, toolCalls: 0 } }));
            controller.close();
            return;
          }

          // 5. Tool execution loop with LIVE streaming
          const toolResults: { tool: string; args: Record<string, string>; result: string; duration: number }[] = [];
          let rounds = 0;
          const maxRounds = plan ? 6 : 4; // Reduced to prevent timeouts

          while (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0 && rounds < maxRounds) {
            rounds++;

            fullMessages.push({
              role: "assistant",
              content: typeof assistantMessage.content === "string" ? assistantMessage.content : (Array.isArray(assistantMessage.content) ? assistantMessage.content.map((c: {type?: string; text?: string}) => c.text || "").join("") : JSON.stringify(assistantMessage.content || "")),
              toolCalls: assistantMessage.toolCalls,
            });

            // Announce all tools starting (shows parallel execution in UI)
            for (const call of assistantMessage.toolCalls) {
              const fn = call.function;
              let startArgs: Record<string, string> = {};
              try { startArgs = JSON.parse(fn.arguments as string); } catch { startArgs = {}; }
              controller.enqueue(sseEvent("tool_start", { tool: fn.name, args: startArgs }));
            }

            // Execute ALL tools in parallel (like a multi-agent system)
            const permissionTools = ["search_gmail", "read_gmail", "search_files", "get_calendar", "get_location"];
            const toolPromises = assistantMessage.toolCalls.map(async (call) => {
              const fn = call.function;
              let args: Record<string, string> = {};
              try { args = JSON.parse(fn.arguments as string); } catch { args = { raw: String(fn.arguments) }; }
              const start = Date.now();
              // Execute with 30s timeout to prevent hanging
              const toolPromise = permissionTools.includes(fn.name)
                ? executePermissionTool(fn.name, args, permContext)
                : executeTool(fn.name, args);
              const rawResult = await Promise.race([
                toolPromise,
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Tool timeout")), 30000))
              ]).catch(e => `Tool execution failed: ${e instanceof Error ? e.message : "timeout"}`);
              // Ensure result is always a string (never [object Object])
              const result = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult);
              const duration = Date.now() - start;

              // Stream result as soon as THIS tool finishes
              controller.enqueue(sseEvent("tool_result", {
                tool: fn.name, args, result: result.slice(0, 500), duration,
              }));

              return { call, fn, args, result, duration };
            });

            const resolvedTools = await Promise.all(toolPromises);

            // Add results to message history in order
            for (const { call, args, result, duration } of resolvedTools) {
              toolResults.push({ tool: call.function.name, args, result, duration });
              fullMessages.push({ role: "tool", content: result, toolCallId: call.id });
            }

            controller.enqueue(sseEvent("status", "Analyzing results..."));
            response = await callMistral(fullMessages);
            assistantMessage = response!.choices?.[0]?.message;
            if (!assistantMessage) break;

            if (!assistantMessage.content && (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0)) {
              assistantMessage = { ...assistantMessage, content: "I've completed all the steps. Let me know if you need anything else!" };
              break;
            }
          }

          // 6. Extract documents
          const documents: { title: string; content: string; type: string }[] = [];
          for (const tr of toolResults) {
            if (tr.tool === "create_document") {
              try {
                const doc = JSON.parse(tr.result);
                if (doc._type === "document") {
                  documents.push({ title: doc.title, content: doc.content, type: doc.docType });
                }
              } catch { /* not a doc */ }
            }
          }

          // 7. Final content — STREAMED word-by-word
          let finalContent = "";
          if (rounds === 0 && assistantMessage?.content && (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0)) {
            // Simple query, no tools — use REAL Mistral streaming for instant feel
            controller.enqueue(sseEvent("status", ""));
            finalContent = await streamMistralFinal(fullMessages);
          } else if (assistantMessage?.content && (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0)) {
            // After tool execution — we already have content, simulate streaming
            const content = String(assistantMessage.content);
            // Stream word-by-word at readable pace (like ChatGPT ~30ms/word)
            const words = content.split(/(\s+)/);
            for (let i = 0; i < words.length; i++) {
              if (words[i]) {
                controller.enqueue(sseEvent("content_delta", words[i]));
                // Vary the speed slightly for natural feel
                const isSpace = /^\s+$/.test(words[i]);
                if (!isSpace && i < words.length - 1) {
                  const word = words[i];
                  const isHeader = word.startsWith('#');
                  const jitter = Math.random() * 4 - 2; // ±2ms natural variation
                  const delay = isHeader
                    ? 60   // Brief pause before headers
                    : word.endsWith('.') || word.endsWith('!') || word.endsWith('?') || word.endsWith(':')
                    ? 35   // Sentence boundaries — natural breath
                    : word.endsWith(',') || word.endsWith(';')
                    ? 20   // Comma pause
                    : word.endsWith('\n')
                    ? 25   // Line break
                    : 10;  // Fast word pace — ~100 wps, smooth and snappy
                  await new Promise(r => setTimeout(r, Math.max(10, delay + jitter)));
                }
              }
            }
            finalContent = content;
          } else {
            finalContent = String(assistantMessage?.content || "I've completed the task.");
            // Ensure finalContent is clean string
              const cleanFinal = typeof finalContent === "string" ? finalContent : String(finalContent);
              if (cleanFinal && !cleanFinal.includes("[object Object]")) {
                controller.enqueue(sseEvent("content_delta", cleanFinal));
              }
          }

          // 8. Generate follow-up suggestions
          const suggestions: string[] = [];
          try {
            const suggestRes = await mistral.chat.complete({
              model: "mistral-small-latest",
              messages: [
                {
                  role: "system",
                  content: `Generate 3 follow-up actions based on this response. Rules:
1. 3-8 words each, actionable (start with a verb)
2. Match the EXACT language of the response (German → German, English → English)
3. Mix: (a) dive deeper into the topic, (b) a related tool action, (c) a creative twist
4. Reference specific data from the response (names, numbers, topics)
5. Return ONLY a JSON array like ["action 1","action 2","action 3"]
Example: ["Vergleiche das mit GPT-4","Zeig mir den Trend","Erstelle einen Bericht"]`,
                },
                { role: "user", content: finalContent.slice(0, 500) },
              ],
              temperature: 0.5,
            });
            const suggestText = String(suggestRes.choices?.[0]?.message?.content || "");
            const match = suggestText.match(/\[[\s\S]*\]/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (Array.isArray(parsed)) suggestions.push(...parsed.slice(0, 3));
            }
          } catch { /* suggestions are optional */ }

          // 9. Done with metadata
          controller.enqueue(sseEvent("content_done", finalContent));
          controller.enqueue(sseEvent("done", {
            model: route, plan, documents, suggestions,
            toolResults: toolResults.map(t => ({ tool: t.tool, args: t.args, result: t.result.slice(0, 500), duration: t.duration })),
            usage: { totalRounds: rounds, toolCalls: toolResults.length },
          }));

          controller.close();
        } catch (error) {
          controller.enqueue(sseEvent("error", { message: error instanceof Error ? error.message : "Unknown error" }));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      { error: `Failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 }
    );
  }
}
