import { NextRequest } from "next/server";
import { Mistral } from "@mistralai/mistralai";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || "" });

const MISSI_INSTRUCTIONS = `You are MISSI (Mistral Intelligent System for Seamless Interaction), a voice-first AI operating system.
Personality: Helpful, concise, natural. Speak like a knowledgeable friend.
Language: Always respond in the same language the user uses.
Format: Use markdown for structure. Be thorough but not verbose.
When searching the web, always cite your sources with URLs.
When generating code, use the code interpreter to validate and run it.
When asked to create images, use the image generation tool.`;

let cachedAgentId: string | null = null;

async function getOrCreateAgent(): Promise<string> {
  if (cachedAgentId) {
    try { await client.beta.agents.get({ agentId: cachedAgentId }); return cachedAgentId; }
    catch { cachedAgentId = null; }
  }
  const agent = await client.beta.agents.create({
    model: "mistral-large-latest",
    name: "MISSI",
    description: "Voice-first AI OS",
    instructions: MISSI_INSTRUCTIONS,
    tools: [
      { type: "web_search" as const },
      { type: "code_interpreter" as const },
      { type: "image_generation" as const },
    ],
    completionArgs: { temperature: 0.7, maxTokens: 4096 },
  });
  cachedAgentId = agent.id;
  return agent.id;
}

function sseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
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
          model: "mistral-large-latest", label: "Mistral Large (Agent)",
          reason: "Agents API", startTime: Date.now(),
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
          streamResponse = await client.beta.conversations.startStream({ agentId, inputs });
        }

        let fullContent = "";
        let newConversationId = conversationId || "";
        const sources: Array<{ url: string; title: string; domain: string; favicon: string }> = [];
        const toolExecs: Array<{ name: string; status: string }> = [];

        for await (const event of streamResponse) {
          const evtType: string = event.event || "";
          if (event.data?.conversationId) newConversationId = event.data.conversationId;

          if (evtType === "tool.execution.started") {
            const name = event.data?.name || "tool";
            toolExecs.push({ name, status: "running" });
            controller.enqueue(sseEvent("tool_start", { tool: name, args: {} }));
          }

          if (evtType === "tool.execution.done") {
            const name = event.data?.name || "tool";
            const ex = toolExecs.find(t => t.name === name && t.status === "running");
            if (ex) ex.status = "done";
            controller.enqueue(sseEvent("tool_result", { tool: name, args: {}, result: "Complete", duration: 0 }));
          }

          if (evtType === "message.output.delta") {
            const content = event.data?.content;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const processPart = async (part: any) => {
              if (!part || typeof part !== "object") return;
              if (part.type === "text" && part.text) {
                fullContent += part.text;
                controller.enqueue(sseEvent("content_delta", part.text));
              } else if (part.type === "tool_reference" && part.url) {
                try {
                  const domain = new URL(part.url).hostname.replace("www.", "");
                  if (!sources.find(s => s.url === part.url)) {
                    sources.push({
                      url: part.url,
                      title: (part.title || domain).slice(0, 80),
                      domain,
                      favicon: "https://www.google.com/s2/favicons?domain=" + domain + "&sz=32",
                    });
                  }
                } catch { /* skip */ }
              } else if (part.type === "tool_file" && part.fileId) {
                try {
                  const signed = await client.files.getSignedUrl({ fileId: part.fileId });
                  if (signed.url) {
                    controller.enqueue(sseEvent("image_generated", { url: signed.url, fileId: part.fileId }));
                    const imgMd = "\n\n![Generated Image](" + signed.url + ")\n\n";
                    fullContent += imgMd;
                    controller.enqueue(sseEvent("content_delta", imgMd));
                  }
                } catch {
                  controller.enqueue(sseEvent("content_delta", "\n\n*Image generated but display unavailable.*\n\n"));
                }
              }
            };

            if (typeof content === "string") {
              fullContent += content;
              controller.enqueue(sseEvent("content_delta", content));
            } else if (Array.isArray(content)) {
              for (const part of content) await processPart(part);
            } else if (content && typeof content === "object") {
              await processPart(content);
            }
          }
        }

        if (sources.length > 0) controller.enqueue(sseEvent("sources", sources));
        if (newConversationId) controller.enqueue(sseEvent("conversation_id", newConversationId));

        try {
          const suggest = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [
              { role: "assistant" as const, content: fullContent.slice(0, 800) },
              { role: "user" as const, content: "Generate 3 follow-up questions (3-8 words). Match language. Return ONLY JSON array." },
            ],
            temperature: 0.8, maxTokens: 150,
          });
          const txt = String(suggest.choices?.[0]?.message?.content || "[]");
          const m = txt.match(/\[[\s\S]*?\]/);
          if (m) controller.enqueue(sseEvent("suggestions", JSON.parse(m[0])));
        } catch { /* skip */ }

        controller.enqueue(sseEvent("done", { toolsUsed: toolExecs.filter(t => t.status === "done").length, sources: sources.length }));
        controller.close();
      } catch (err) {
        controller.enqueue(sseEvent("error", err instanceof Error ? err.message : String(err)));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
