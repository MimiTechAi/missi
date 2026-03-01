import { Mistral } from "@mistralai/mistralai";
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
      label: "Pixtral Large (Vision)",
      reason: "Image analysis detected",
    };
  }

  const lower = message.toLowerCase();

  // Code-related
  const codeKeywords = [
    "code", "function", "class", "debug", "refactor", "implement",
    "javascript", "python", "typescript", "rust", "html", "css",
    "algorithm", "regex", "api", "endpoint", "database", "sql",
    "git", "deploy", "docker", "compile", "syntax", "variable",
    "write a script", "write code", "fix this", "bug",
  ];
  if (codeKeywords.some((k) => lower.includes(k))) {
    return {
      model: "codestral-latest",
      label: "Codestral (Code Specialist)",
      reason: "Code-related query detected",
    };
  }

  // Complex reasoning / research / analysis
  const complexKeywords = [
    "research", "analyze", "compare", "explain in detail", "write a report",
    "summarize", "pros and cons", "strategy", "plan", "evaluate",
    "deep dive", "comprehensive", "thorough", "essay", "article",
    "business plan", "market analysis", "step by step",
    "introduce yourself", "stell dich vor", "show what you can do",
    "who are you", "wer bist du", "what can you do", "was kannst du",
    // German
    "recherchiere", "analysiere", "vergleiche", "erstelle", "bericht",
    "zusammenfassung", "strategie", "untersuche", "erkläre",
    // French
    "recherche", "analyse", "compare", "rapport", "résumé",
    // Spanish
    "investiga", "analiza", "compara", "informe", "resumen",
  ];
  if (
    complexKeywords.some((k) => lower.includes(k)) ||
    message.length > 200 ||
    message.includes("?") && message.split("?").length > 2
  ) {
    return {
      model: "mistral-large-latest",
      label: "Mistral Large (Deep Reasoning)",
      reason: "Complex analysis or multi-part query",
    };
  }

  // Default: fast model for simple queries
  return {
    model: "mistral-small-latest",
    label: "Mistral Small (Fast)",
    reason: "Simple query — optimized for speed",
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

  if (!isComplex) return null;

  try {
    const planResponse = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        {
          role: "system",
          content: `You are a task planner. Given a user request, break it into 2-5 concrete steps.
Each step should be an action the AI agent can execute using its tools.
Available tools: web_search, read_webpage, get_weather, get_time, calculate, run_code, create_document, translate, analyze_data, generate_code, summarize_text.
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
// EXPANDED TOOL DEFINITIONS (12 Tools)
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
];

// ============================================================
// TOOL EXECUTION ENGINE
// ============================================================

// Helper to execute Composio tools directly
async function composioExecute(toolName: string, params: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!process.env.COMPOSIO_API_KEY) return null;
  try {
    const res = await fetch("https://backend.composio.dev/api/v3/tools/execute/direct", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.COMPOSIO_API_KEY,
      },
      body: JSON.stringify({
        tool_name: toolName,
        input: params,
        user_id: "missi_demo_user",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case "web_search": {
      try {
        // Use Mistral's native web search via Conversations API for reliable results + citations
        const searchResponse = await mistral.beta.conversations.start({
          model: "mistral-large-latest",
          inputs: `Search the web for: ${args.query}. Return the top results with titles, snippets, and URLs.`,
          tools: [{ type: "web_search" as const }],
          store: false,
        });

        // Extract text and references from the response (handle multiple response formats)
        const results: string[] = [];
        const refs: string[] = [];
        const entries = searchResponse.outputs || [];
        for (const entry of entries) {
          // Handle message.output entries
          if (entry.type === "message.output" && Array.isArray(entry.content)) {
            for (const chunk of entry.content) {
              if (chunk.type === "text" && chunk.text) {
                results.push(chunk.text);
              } else if (chunk.type === "tool_reference" && chunk.url) {
                refs.push(`🔗 [${chunk.title || chunk.url}](${chunk.url})`);
              }
            }
          }
          // Handle direct text content
          if (typeof entry === "object" && "text" in entry && typeof entry.text === "string") {
            results.push(entry.text);
          }
        }
        
        // Also check for top-level response content
        const resp = searchResponse as Record<string, unknown>;
        if (typeof resp.content === "string" && resp.content.length > 10) {
          results.push(resp.content);
        }

        if (results.length > 0) {
          const combined = results.join("\n");
          const refsStr = refs.length > 0 ? `\n\n**Sources:**\n${refs.join("\n")}` : "";
          return `🔍 Search results for "${args.query}":\n\n${combined}${refsStr}`;
        }
        return "No results found.";
      } catch {
        // Fallback to DuckDuckGo if Conversations API fails
        try {
          const res = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`,
            { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
          );
          const html = await res.text();
          const resultBlocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>/g) || [];
          const extracted: string[] = [];
          for (const block of resultBlocks.slice(0, 8)) {
            const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
            const urlMatch = block.match(/href="([^"]*?)"/);
            const title = titleMatch?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
            const url = urlMatch?.[1] || "";
            if (title) extracted.push(`• ${title}${url ? `\n  🔗 ${url}` : ""}`);
          }
          return extracted.length > 0 ? `🔍 Results for "${args.query}":\n\n${extracted.join("\n\n")}` : "No results found.";
        } catch {
          return "Web search is temporarily unavailable. I'll try to answer from my knowledge instead.";
        }
      }
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
          let jsCode = args.code
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
      return JSON.stringify({
        _type: "document",
        title: args.title,
        docType,
        content: args.content,
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
          model: "mistral-small-latest",
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
      // Priority 2: Use Composio
      if (!process.env.COMPOSIO_API_KEY) return "Gmail not connected. Click the 📧 icon in the sidebar to connect Gmail.";
      try {
        const res = await fetch("https://backend.composio.dev/api/v3/tools/execute/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.COMPOSIO_API_KEY || "" },
          body: JSON.stringify({ tool_name: "GMAIL_SEARCH_EMAILS", user_id: "missi_demo_user",
            input: { query: args.query, max_results: args.limit || 5 },
          }),
        });
        const data = await res.json();
        if (data?.data) {
          const emails = data.data;
          if (!emails.length) return `No emails found for: "${args.query}"`;
          return emails.map((m: Record<string, string>) =>
            `📧 **${m.subject || "No subject"}**\n   From: ${m.from || m.sender || "Unknown"}\n   Date: ${m.date || ""}\n   Preview: ${(m.snippet || m.body || "").slice(0, 150)}`
          ).join("\n\n");
        }
        return `No emails found for: "${args.query}". Make sure Gmail is connected via the sidebar.`;
      } catch {
        return "Gmail search failed. Please click the 📧 icon in the sidebar to connect Gmail first.";
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
      // Priority 2: Composio
      if (!process.env.COMPOSIO_API_KEY) return "Gmail not connected. Click 📧 in sidebar to connect.";
      try {
        const res = await fetch("https://backend.composio.dev/api/v3/tools/execute/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.COMPOSIO_API_KEY || "" },
          body: JSON.stringify({ tool_name: "GMAIL_GET_EMAIL", user_id: "missi_demo_user",
            input: { message_id: args.id || args.messageId },
          }),
        });
        const data = await res.json();
        if (data?.data) {
          const email = data.data;
          return `📧 **${email.subject || "No subject"}**\nFrom: ${email.from || "Unknown"}\nDate: ${email.date || ""}\n\n${(email.body || email.snippet || "No content").slice(0, 3000)}`;
        }
        return "Could not read email. Make sure Gmail is connected via the sidebar.";
      } catch {
        return "Gmail read failed. Please connect Gmail via the 📧 icon in the sidebar.";
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
      // Priority 2: Composio Google Drive
      if (!process.env.COMPOSIO_API_KEY) return "No folder connected. Click the 📁 icon in the sidebar to grant folder access.";
      try {
        const res = await fetch("https://backend.composio.dev/api/v3/tools/execute/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.COMPOSIO_API_KEY || "" },
          body: JSON.stringify({ tool_name: "GOOGLEDRIVE_SEARCH_FILES", user_id: "missi_demo_user",
            input: { query: args.query, max_results: 10 },
          }),
        });
        const data = await res.json();
        if (data?.data?.length) {
          return data.data.map((f: Record<string, string>) =>
            `🗂️ **${f.name || f.title}** (${f.mimeType || "file"})\n   📎 ${f.webViewLink || "No link"}`
          ).join("\n\n");
        }
        return `No files found for "${args.query}". Connect Google Drive via sidebar.`;
      } catch {
        return "File search failed. Connect Google Drive via sidebar first.";
      }
    }

    case "get_calendar": {
      if (!process.env.COMPOSIO_API_KEY) return "Calendar not configured.";
      try {
        const now = new Date();
        const endDate = new Date(now.getTime() + (parseInt(args.days || "7") * 24 * 60 * 60 * 1000));
        const res = await fetch("https://backend.composio.dev/api/v3/tools/execute/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.COMPOSIO_API_KEY || "" },
          body: JSON.stringify({ tool_name: "GOOGLECALENDAR_LIST_EVENTS", user_id: "missi_demo_user",
            input: { time_min: now.toISOString(), time_max: endDate.toISOString(), max_results: 15 },
          }),
        });
        const data = await res.json();
        if (data?.data) {
          const events = Array.isArray(data.data) ? data.data : [];
          if (!events.length) return "📅 No upcoming events found.";
          return events.map((e: Record<string, string>) => {
            const start = e.start ? new Date(e.start).toLocaleString("de-DE") : "";
            return `📅 **${e.summary || e.title || "Untitled"}**\n   🕐 ${start}${e.location ? `\n   📍 ${e.location}` : ""}`;
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
const SYSTEM_PROMPT = `You are MISSI (Mistral Intelligent System for Seamless Interaction), a voice-first AI operating system. You are powered by Mistral AI's full model ecosystem with intelligent multi-model routing.

PERSONALITY:
- Calm, confident, subtly witty — your intelligent Mistral-powered companion
- When asked to "introduce yourself", "stell dich vor", or "show what you can do": FIRST write a compelling 3-4 sentence introduction about yourself (voice-first AI OS, 4 Mistral models, 25 tools + 10,000+ via Composio, multi-language). THEN say "Let me show you" and demonstrate with 2-3 tool calls.
- Address complex topics with clarity and precision
- Dry humor when appropriate, never forced
- Concise by default, detailed when asked — aim for 2-4 paragraphs unless asked for more
- Proactive — suggest follow-ups, anticipate needs
- When answering, lead with the key insight FIRST, then elaborate
- Use specific numbers, dates, and facts — never be vague
- If a question has multiple angles, acknowledge them briefly
- End responses with a natural transition or actionable next step

LANGUAGE:
- CRITICAL: Detect the user's language and ALWAYS respond in that SAME language
- If the user speaks German, respond in German
- If the user speaks French, respond in French
- If the user speaks Japanese, respond in Japanese
- Default to English only if language is unclear
- The TTS will handle any language

CAPABILITIES:
You have 25 built-in tools PLUS access to 10,000+ external integrations via Composio (Gmail, Google Calendar, GitHub, Slack, Notion, and more). ALWAYS use the appropriate tool — NEVER answer from memory when a tool exists for the task:

MANDATORY TOOL USAGE (you MUST call the tool, do NOT answer from memory):
- "weather" / "Wetter" / "météo" / "tiempo" → MUST use get_weather
- "stock" / "Aktie" / "share price" / "cours" → MUST use get_stock_price  
- "crypto" / "bitcoin" / "ethereum" / "Krypto" → MUST use get_crypto_price
- "time" / "Uhrzeit" / "heure" / "hora" → MUST use get_time
- "calculate" / "rechne" / "berechne" / "calcule" → MUST use calculate
- "search" / "suche" / "recherche" / "news" / "busca" → MUST use web_search
- "news" / "headlines" / "Nachrichten" / "actualités" / "noticias" → MUST use news_headlines
- "wikipedia" / "erkläre" / "explain" / "was ist" / "qu'est-ce" → MUST use wikipedia
- "translate" / "übersetze" / "traduis" / "traduce" → MUST use translate
- "document" / "report" / "Dokument" / "Bericht" / "rapport" → MUST use create_document
- "code" / "Funktion" / "function" / "programmiere" → MUST use generate_code
- "reminder" / "erinnere" / "rappelle" / "recuerda" → MUST use set_reminder
- "voice" / "Stimme" / "change voice" / "voix" → MUST use change_voice
- "webpage" / "read" / "URL" / "lies" / "lire" → MUST use read_webpage
- "summarize" / "zusammenfassen" / "résume" / "resume" → MUST use summarize_text
- "run code" / "execute" / "ausführen" → MUST use run_code
- "convert" / "umrechnen" / "convertir" → MUST use unit_convert
- "define" / "definition" / "bedeutung" / "définition" → MUST use define_word
- "fact" / "trivia" / "wusstest du" / "tell me something" → MUST use random_fact

Available tools:
- web_search: Real-time internet search (8 results with URLs)
- read_webpage: Extract content from any URL
- get_weather: Weather + 3-day forecast for any city
- get_time: Current time in any timezone
- calculate: Math, conversions, financial calculations
- run_code: Execute JavaScript code
- create_document: Generate downloadable reports/documents
- translate: Translate between any languages
- analyze_data: Statistical analysis and pattern finding
- generate_code: Production-quality code via Codestral
- set_reminder: Set reminders
- summarize_text: Summarize long content
- search_gmail: Search Gmail inbox (requires connection)
- read_gmail: Read email by ID (requires connection)
- search_files: Search local files (requires folder connection)
- get_calendar: View Google Calendar events (requires connection)
- get_stock_price: Real-time stock prices (TSLA, AAPL, GOOGL, etc.)
- get_crypto_price: Live crypto prices (bitcoin, ethereum, solana, etc.)
- wikipedia: Wikipedia knowledge in any language
- get_location: User's GPS location (requires browser permission)
- change_voice: Switch MISSI's voice (sarah, aria, rachel, eric, roger, charlie) — default is Sarah
- news_headlines: Latest news headlines by topic/country
- unit_convert: Convert between any units (temperature, length, weight, volume, speed, data)
- define_word: Dictionary definitions, synonyms, examples
- random_fact: Interesting facts and trivia

CRITICAL RULES:
- NEVER make up data, dates, or facts. If a tool returned results, USE THOSE RESULTS in your response — do NOT generate your own content.
- When a tool returns data (weather, news, prices, etc.), your response MUST be based on that tool's output. Quote specific data points.
- For ANY research task: use web_search FIRST, then read_webpage for details, then create_document for the final output
- When a task requires multiple steps, briefly state your plan, then execute ALL steps including document creation
- ALWAYS use create_document when the user asks for a "report", "summary", "comparison", "analysis", or "document"
- Synthesize tool results into clear, well-formatted natural language — present the REAL data from tools, never hallucinate facts
- FORMAT your responses using Markdown: use **bold** for key terms, ## headers for sections, - bullet lists, numbered lists, and \`code\` for technical terms
- Structure long responses with clear headers and organized sections like a professional research report
- Use numbers and specific facts, not vague statements
- Suggest relevant follow-up actions after completing a task
- When a user asks to connect Gmail, Calendar, GitHub, or other services, tell them to click the corresponding icon in the sidebar to authorize access via Composio.

For multi-step tasks, chain tools intelligently: search → read → analyze → create_document`;


// ============================================================
// MAIN API HANDLER — Server-Sent Events (SSE) Streaming
// ============================================================
export const maxDuration = 60; // Allow up to 60s for complex multi-tool queries

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
      console.log("Image detected — routing to Pixtral Large");
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

          const servicesContext = connectedServices.length > 0
            ? "\n\nCURRENTLY CONNECTED SERVICES (user has authorized these — use them directly without asking to connect):\n" + connectedServices.map(s => "- " + s).join("\n") + "\n\nIMPORTANT: When a service is listed above, USE the corresponding tool directly. Do NOT tell the user to \"connect first\" or \"click the sidebar icon\" — it is ALREADY connected and authorized."
            : "\n\nNO EXTERNAL SERVICES CONNECTED YET. If the user asks about Gmail, Calendar, GitHub, etc., tell them to click the corresponding icon in the left sidebar to authorize access first.";

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
                    const chunk = String(delta.content);
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
          const maxRounds = plan ? 8 : 5;

          while (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0 && rounds < maxRounds) {
            rounds++;

            fullMessages.push({
              role: "assistant",
              content: assistantMessage.content ? String(assistantMessage.content) : "",
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
              const result = await Promise.race([
                toolPromise,
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Tool timeout")), 30000))
              ]).catch(e => `Tool execution failed: ${e instanceof Error ? e.message : "timeout"}`);
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
            controller.enqueue(sseEvent("content_delta", finalContent));
          }

          // 8. Generate follow-up suggestions
          const suggestions: string[] = [];
          try {
            const suggestRes = await mistral.chat.complete({
              model: "mistral-small-latest",
              messages: [
                {
                  role: "system",
                  content: `Based on this AI response, generate 3 follow-up suggestions. Rules:
1. Each suggestion is 3-8 words
2. Match the SAME LANGUAGE as the response
3. Make them genuinely useful and specific (not generic)
4. Mix: one deeper question, one related action, one new angle
5. Return ONLY a JSON array, no markdown
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
