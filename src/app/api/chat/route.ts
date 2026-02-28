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
      description: "Change MISSI's speaking voice. Available voices: 'eric' (default male), 'aria' (female), 'roger' (deep male), 'sarah' (warm female), 'charlie' (british male)",
      parameters: {
        type: "object" as const,
        properties: {
          voice: { type: "string" as const, description: "Voice name: 'eric', 'aria', 'roger', 'sarah', 'charlie'" },
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
async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case "web_search": {
      try {
        const res = await fetch(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          }
        );
        const html = await res.text();
        // Extract result links and snippets
        const resultBlocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>/g) || [];
        const results: string[] = [];
        
        for (const block of resultBlocks.slice(0, 8)) {
          const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
          const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a?/);
          const urlMatch = block.match(/href="([^"]*?)"/);
          const title = titleMatch?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
          const snippet = snippetMatch?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
          const url = urlMatch?.[1] || "";
          if (title) results.push(`• ${title}\n  ${snippet}${url ? `\n  🔗 ${url}` : ""}`);
        }

        if (results.length === 0) {
          // Fallback: simpler extraction
          const links = html.match(/<a rel="nofollow" class="result__a" href="[^"]*">.*?<\/a>/g);
          if (links) {
            return links.slice(0, 8).map((r) => r.replace(/<[^>]*>/g, "")).join("\n");
          }
        }
        return `🔍 Search results for "${args.query}":\n\n${results.join("\n\n")}` || "No results found.";
      } catch {
        return "Search temporarily unavailable.";
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
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m,relative_humidity_2m,weather_code,precipitation&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=3`
        );
        const weather = await weatherRes.json();
        const c = weather.current;
        const d = weather.daily;
        const weatherCodes: Record<number, string> = {
          0: "Clear sky ☀️", 1: "Mainly clear 🌤️", 2: "Partly cloudy ⛅", 3: "Overcast ☁️",
          45: "Foggy 🌫️", 51: "Light drizzle 🌧️", 61: "Light rain 🌧️", 63: "Moderate rain 🌧️",
          65: "Heavy rain 🌧️", 71: "Light snow ❄️", 73: "Moderate snow ❄️", 80: "Rain showers 🌦️",
          95: "Thunderstorm ⛈️",
        };
        const condition = weatherCodes[c.weather_code] || `Code ${c.weather_code}`;
        return `Weather in ${city}, ${country}:
🌡️ ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C)
${condition}
💨 Wind: ${c.wind_speed_10m} km/h
💧 Humidity: ${c.relative_humidity_2m}%
🌧️ Precipitation: ${c.precipitation} mm

3-Day Forecast:
• Today: ${d.temperature_2m_min[0]}°–${d.temperature_2m_max[0]}°C
• Tomorrow: ${d.temperature_2m_min[1]}°–${d.temperature_2m_max[1]}°C  
• Day after: ${d.temperature_2m_min[2]}°–${d.temperature_2m_max[2]}°C`;
      } catch {
        return "Weather service temporarily unavailable.";
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
        const fn = new Function(`"use strict"; ${args.code}`);
        const result = fn();
        return `Output: ${JSON.stringify(result, null, 2) ?? "undefined"}`;
      } catch (e) {
        return `Execution error: ${e}`;
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
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(args.symbol)}?interval=1d&range=1d`
        );
        const data = await res.json();
        const meta = data.chart?.result?.[0]?.meta;
        if (!meta) return `Stock symbol "${args.symbol}" not found.`;
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose;
        const change = ((price - prevClose) / prevClose * 100).toFixed(2);
        const direction = Number(change) >= 0 ? "📈" : "📉";
        return `${direction} ${args.symbol.toUpperCase()}: $${price.toFixed(2)} (${Number(change) >= 0 ? "+" : ""}${change}% today)\nPrevious close: $${prevClose.toFixed(2)}\nCurrency: ${meta.currency}`;
      } catch {
        return `Could not fetch stock price for ${args.symbol}.`;
      }
    }

    case "get_crypto_price": {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(args.coin)}&vs_currencies=usd,eur&include_24hr_change=true`
        );
        const data = await res.json();
        const coin = data[args.coin.toLowerCase()];
        if (!coin) return `Cryptocurrency "${args.coin}" not found. Try 'bitcoin', 'ethereum', 'solana'.`;
        const change = coin.usd_24h_change?.toFixed(2) || "N/A";
        const dir = Number(change) >= 0 ? "📈" : "📉";
        return `${dir} ${args.coin.charAt(0).toUpperCase() + args.coin.slice(1)}:\n💵 $${coin.usd?.toLocaleString()} USD\n💶 €${coin.eur?.toLocaleString()} EUR\n24h change: ${Number(change) >= 0 ? "+" : ""}${change}%`;
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
        eric: { id: "cjVigY5qzO86Huf0OWal", name: "Eric (Default)" },
        aria: { id: "9BWtsMINqrJLrRacOk9x", name: "Aria (Female)" },
        roger: { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger (Deep Male)" },
        sarah: { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Warm Female)" },
        charlie: { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie (British Male)" },
      };
      const v = voices[args.voice.toLowerCase()];
      if (!v) return `Unknown voice. Available: ${Object.keys(voices).join(", ")}`;
      return JSON.stringify({ _type: "voice_change", voiceId: v.id, voiceName: v.name });
    }

    case "news_headlines": {
      try {
        const topic = args.topic || "latest";
        const country = args.country || "";
        const searchQuery = country 
          ? `${topic} news ${country} today ${new Date().toISOString().split("T")[0]}`
          : `${topic} news today ${new Date().toISOString().split("T")[0]}`;
        const res = await fetch(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
          { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
        );
        const html = await res.text();
        const blocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>/g) || [];
        const headlines: string[] = [];
        for (const block of blocks.slice(0, 8)) {
          const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
          const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a?/);
          const title = titleMatch?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
          const snippet = snippetMatch?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
          if (title) headlines.push(`📰 ${title}\n   ${snippet}`);
        }
        return `📰 Top Headlines — ${topic}${country ? ` (${country.toUpperCase()})` : ""}:\n\n${headlines.join("\n\n")}` || "No headlines found.";
      } catch {
        return "News service temporarily unavailable.";
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

    case "get_calendar": {
      // Calendar is a permission-gated tool
      return "Calendar not connected. Please connect your Google account first.";
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// Permission-gated tool execution (needs external context from frontend)
async function executePermissionTool(name: string, args: Record<string, string>, context: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "search_gmail": {
      const token = context.gmailToken as string;
      if (!token) return "Gmail not connected. Please click 'Connect Gmail' to grant access first.";
      try {
        const res = await fetch(`${context.baseUrl}/api/auth/gmail`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search", token, query: args.query }),
        });
        const data = await res.json();
        if (!data.results?.length) return `No emails found for query: "${args.query}"`;
        return data.results.map((m: { subject: string; from: string; date: string; snippet: string; id: string }) =>
          `📧 ${m.subject}\n   From: ${m.from}\n   Date: ${m.date}\n   Preview: ${m.snippet}\n   [ID: ${m.id}]`
        ).join("\n\n");
      } catch {
        return "Failed to search Gmail. Token may have expired — please reconnect.";
      }
    }

    case "read_gmail": {
      const token = context.gmailToken as string;
      if (!token) return "Gmail not connected. Please click 'Connect Gmail' to grant access first.";
      try {
        const res = await fetch(`${context.baseUrl}/api/auth/gmail`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "read", token, messageId: args.messageId }),
        });
        const data = await res.json();
        return `📧 ${data.subject}\nFrom: ${data.from}\nDate: ${data.date}\n\n${data.body}`;
      } catch {
        return "Failed to read email.";
      }
    }

    case "search_files": {
      const fileIndex = context.fileIndex as string;
      if (!fileIndex) return "No folder connected. Please click '📂 Connect Folder' to grant file access first.";
      const query = args.query.toLowerCase();
      const files = fileIndex.split("\n").filter(f => f.toLowerCase().includes(query));
      if (files.length === 0) return `No files matching "${args.query}" found in the connected folder.`;
      return `Found ${files.length} matching files:\n${files.slice(0, 20).join("\n")}`;
    }

    case "get_calendar": {
      const token = context.gmailToken as string;
      if (!token) return "Google account not connected. Please click '📧 Gmail' to grant access first.";
      try {
        const days = parseInt(args.days || "1") || 1;
        const now = new Date();
        const end = new Date(now.getTime() + days * 86400000);
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=10`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!data.items?.length) return `No events in the next ${days} day(s).`;
        return data.items.map((e: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string }) => {
          const start = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString() : e.start?.date || "";
          return `📅 ${e.summary || "No title"}\n   ${start}${e.location ? `\n   📍 ${e.location}` : ""}`;
        }).join("\n\n");
      } catch {
        return "Failed to fetch calendar. Token may have expired.";
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
- Address complex topics with clarity and precision
- Dry humor when appropriate, never forced
- Concise by default, detailed when asked
- Proactive — suggest follow-ups, anticipate needs

LANGUAGE:
- CRITICAL: Detect the user's language and ALWAYS respond in that SAME language
- If the user speaks German, respond in German
- If the user speaks French, respond in French
- If the user speaks Japanese, respond in Japanese
- Default to English only if language is unclear
- The TTS will handle any language

CAPABILITIES:
You have 25 tools at your disposal. ALWAYS use the appropriate tool — NEVER answer from memory when a tool exists for the task:

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
- change_voice: Switch MISSI's voice (eric, aria, roger, sarah, charlie)
- news_headlines: Latest news headlines by topic/country
- unit_convert: Convert between any units (temperature, length, weight, volume, speed, data)
- define_word: Dictionary definitions, synonyms, examples
- random_fact: Interesting facts and trivia

CRITICAL RULES:
- For ANY research task: use web_search FIRST, then read_webpage for details, then create_document for the final output
- When a task requires multiple steps, briefly state your plan, then execute ALL steps including document creation
- ALWAYS use create_document when the user asks for a "report", "summary", "comparison", "analysis", or "document"
- Synthesize tool results into natural language — never dump raw data
- FORMAT your responses using Markdown: use **bold** for key terms, ## headers for sections, - bullet lists, numbered lists, and \`code\` for technical terms
- Structure long responses with clear headers and organized sections like a professional research report
- Use numbers and specific facts, not vague statements
- Suggest relevant follow-up actions after completing a task
- For multi-step tasks, chain tools intelligently: search → read → analyze → create_document`;


// ============================================================
// MAIN API HANDLER — Server-Sent Events (SSE) Streaming
// ============================================================
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  function sseEvent(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const { messages, image, permissions } = await req.json();
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    const hasImage = !!image;
    // Permission context from frontend
    const permContext = {
      gmailToken: permissions?.gmailToken || "",
      fileIndex: permissions?.fileIndex || "",
      location: permissions?.location || "",
      baseUrl: req.nextUrl.origin,
    };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 1. Model selection
          const route = routeModel(lastUserMsg, hasImage);
          controller.enqueue(sseEvent("model_selected", route));

          // 2. Planning
          const plan = await createPlan(lastUserMsg);
          if (plan) {
            controller.enqueue(sseEvent("plan", plan));
          }

          // 3. Build messages
          const fullMessages: Array<Record<string, unknown>> = [
            { role: "system", content: SYSTEM_PROMPT },
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

          // Retry wrapper
          const callMistral = async (msgs: Array<Record<string, unknown>>) => {
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                return await mistral.chat.complete({
                  model: route.model,
                  messages: msgs as Parameters<typeof mistral.chat.complete>[0]["messages"],
                  ...(useTools ? { tools, toolChoice: "auto" as const } : {}),
                  temperature: 0.7,
                });
              } catch (e: unknown) {
                const err = e as { statusCode?: number };
                if (err.statusCode === 429 && attempt < 2) {
                  // Exponential backoff: 3s, 8s
                  await new Promise(r => setTimeout(r, (attempt + 1) * 3000 + 2000));
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
            controller.enqueue(sseEvent("content", "I'm ready. How can I help you?"));
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

            for (const call of assistantMessage.toolCalls) {
              const fn = call.function;
              const args = JSON.parse(fn.arguments as string);

              // >>> STREAM: tool_start — user sees live tool execution
              controller.enqueue(sseEvent("tool_start", { tool: fn.name, args }));

              const start = Date.now();
              const permissionTools = ["search_gmail", "read_gmail", "search_files", "get_calendar", "get_location"];
              const result = permissionTools.includes(fn.name)
                ? await executePermissionTool(fn.name, args, permContext)
                : await executeTool(fn.name, args);
              const duration = Date.now() - start;

              // >>> STREAM: tool_result — user sees result immediately
              controller.enqueue(sseEvent("tool_result", {
                tool: fn.name, args, result: result.slice(0, 500), duration,
              }));

              toolResults.push({ tool: fn.name, args, result, duration });
              fullMessages.push({ role: "tool", content: result, toolCallId: call.id });
            }

            controller.enqueue(sseEvent("status", "Analyzing results..."));
            response = await callMistral(fullMessages);
            assistantMessage = response!.choices?.[0]?.message;
            if (!assistantMessage) break;

            if (!assistantMessage.content && (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0)) {
              assistantMessage = { ...assistantMessage, content: "I've completed the task." };
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

          // 7. Final content
          controller.enqueue(sseEvent("content", assistantMessage?.content || ""));

          // 8. Done with metadata
          controller.enqueue(sseEvent("done", {
            model: route, plan, documents,
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
