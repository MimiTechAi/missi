import { NextRequest } from "next/server";
import { Mistral } from "@mistralai/mistralai";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || "" });

const MISSI_INSTRUCTIONS = `You are MISSI (Mistral Intelligent System for Seamless Interaction), a voice-first AI operating system.

Personality: Helpful, concise, natural. Speak like a knowledgeable friend.
Language: Always respond in the same language the user uses.
Format: Use markdown for structure. Be thorough but not verbose.

When searching the web, always provide inline citations with source URLs.
When generating code, use the code interpreter to validate it works.

You have access to Web Search, Code Interpreter, and Image Generation.
Always cite your sources when using web search.`;

let cachedAgentId: string | null = null;

async function getOrCreateAgent(): Promise<string> {
  if (cachedAgentId) return cachedAgentId;
  const agent = await client.beta.agents.create({
    model: "mistral-large-latest",
    name: "MISSI",
    description: "Voice-first AI OS with built-in web search, code execution, and image generation",
    instructions: MISSI_INSTRUCTIONS,
    tools: [
      { type: "web_search" as const },
      { type: "code_interpreter" as const },
      { type: "image_generation" as const },
    ],
    completionArgs: {
      temperature: 0.7,
      maxTokens: 4096,
    },
  });
  cachedAgentId = agent.id;
  return agent.id;
}

function sseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  const { message, conversationId, image } = await req.json();

  if (!process.env.MISTRAL_API_KEY) {
    return new Response(JSON.stringify({ error: "API key missing" }), { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agentId = await getOrCreateAgent();
        controller.enqueue(sseEvent("model_selected", {
          model: "mistral-large-latest",
          label: "Mistral Large (Agent)",
          reason: "Agents API with built-in tools",
          startTime: Date.now(),
        }));

        const inputs = image
          ? [{ role: "user" as const, content: [
              { type: "text" as const, text: message || "Analyze this image." },
              { type: "image_url" as const, imageUrl: { url: image } },
            ]}]
          : message;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let streamResponse: any;
        if (conversationId) {
          streamResponse = await client.beta.conversations.appendStream({
            conversationId,
            conversationAppendStreamRequest: { inputs },
          });
        } else {
          streamResponse = await client.beta.conversations.startStream({
            agentId,
            inputs,
          });
        }

        let fullContent = "";
        let newConversationId = conversationId || "";
        const sources: Array<{ url: string; title: string; domain: string; favicon: string }> = [];
        const toolExecutions: Array<{ name: string }> = [];

        for await (const event of streamResponse) {
          if (event.data?.conversationId) {
            newConversationId = event.data.conversationId;
          }

          const evtType = event.event || event.type || "";

          if (evtType.includes("tool") && evtType.includes("started")) {
            const toolName = event.data?.name || "tool";
            controller.enqueue(sseEvent("tool_start", { tool: toolName, args: {} }));
          }

          if (evtType.includes("tool") && evtType.includes("done")) {
            const toolName = event.data?.name || "tool";
            toolExecutions.push({ name: toolName });
            controller.enqueue(sseEvent("tool_result", { tool: toolName, args: {}, result: "Complete", duration: 0 }));
          }

          if (evtType.includes("delta")) {
            const chunk = event.data?.content;
            if (typeof chunk === "string") {
              fullContent += chunk;
              controller.enqueue(sseEvent("content_delta", chunk));
            } else if (Array.isArray(chunk)) {
              for (const part of chunk) {
                if (part.type === "text" && part.text) {
                  fullContent += part.text;
                  controller.enqueue(sseEvent("content_delta", part.text));
                } else if (part.type === "tool_reference" && part.url) {
                  try {
                    const domain = new URL(part.url).hostname.replace("www.", "");
                    sources.push({
                      url: part.url,
                      title: part.title || domain,
                      domain,
                      favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                    });
                  } catch { /* skip */ }
                }
              }
            }
          }

          if (evtType.includes("output") && evtType.includes("done")) {
            const content = event.data?.content;
            if (Array.isArray(content)) {
              for (const part of content) {
                if (part.type === "tool_reference" && part.url) {
                  try {
                    const domain = new URL(part.url).hostname.replace("www.", "");
                    if (!sources.find((s: { url: string }) => s.url === part.url)) {
                      sources.push({ url: part.url, title: part.title || domain, domain, favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32` });
                    }
                  } catch { /* skip */ }
                }
              }
            }
          }
        }

        if (sources.length > 0) controller.enqueue(sseEvent("sources", sources));
        controller.enqueue(sseEvent("conversation_id", newConversationId));

        try {
          const suggestResponse = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [
              { role: "assistant" as const, content: fullContent.slice(0, 1000) },
              { role: "user" as const, content: 'Generate exactly 3 follow-up questions (3-8 words each). Match response language. Return ONLY a JSON array.' },
            ],
            temperature: 0.8,
            maxTokens: 150,
          });
          const suggestText = String(suggestResponse.choices?.[0]?.message?.content || "[]");
          const match = suggestText.match(/\[[\s\S]*\]/);
          if (match) controller.enqueue(sseEvent("suggestions", JSON.parse(match[0])));
        } catch { /* non-critical */ }

        controller.enqueue(sseEvent("done", { toolsUsed: toolExecutions.length }));
        controller.close();
      } catch (err) {
        controller.enqueue(sseEvent("error", String(err)));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
