import { NextRequest, NextResponse } from "next/server";

// Lazy-initialize Composio client (only when API key is available at runtime)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let composioInstance: any = null;

async function getComposio() {
  if (composioInstance) return composioInstance;
  if (!process.env.COMPOSIO_API_KEY) return null;
  const { Composio } = await import("@composio/core");
  composioInstance = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  return composioInstance;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sessionCache = new Map<string, { session: any; created: number }>();

async function getOrCreateSession(userId: string) {
  const composio = await getComposio();
  if (!composio) throw new Error("COMPOSIO_API_KEY not set");
  const cached = sessionCache.get(userId);
  if (cached && Date.now() - cached.created < 30 * 60 * 1000) {
    return cached.session;
  }
  const session = await composio.create(userId);
  sessionCache.set(userId, { session, created: Date.now() });
  return session;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId = "missi_demo_user", toolkit } = body;

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({
        error: "Composio not configured",
        message: "Set COMPOSIO_API_KEY to enable 10,000+ tool integrations."
      }, { status: 501 });
    }

    const session = await getOrCreateSession(userId);

    switch (action) {
      case "toolkits": {
        return NextResponse.json({
          toolkits: [
            { id: "gmail", name: "Gmail", icon: "📧", desc: "Read, search, send emails" },
            { id: "googlecalendar", name: "Google Calendar", icon: "📅", desc: "View, create events" },
            { id: "github", name: "GitHub", icon: "🐙", desc: "Issues, PRs, repos" },
            { id: "slack", name: "Slack", icon: "💬", desc: "Messages, channels" },
            { id: "notion", name: "Notion", icon: "📝", desc: "Pages, databases" },
            { id: "googledrive", name: "Google Drive", icon: "📁", desc: "Files, sharing" },
            { id: "spotify", name: "Spotify", icon: "🎵", desc: "Playlists, playback" },
            { id: "trello", name: "Trello", icon: "📋", desc: "Boards, cards" },
            { id: "linear", name: "Linear", icon: "🔷", desc: "Issues, projects" },
          ],
        });
      }

      case "connect": {
        try {
          const connectionRequest = await session.authorize(toolkit || "gmail");
          const connectUrl = connectionRequest.redirectUrl || connectionRequest.url || null;
          console.log("[COMPOSIO] Connect URL for", toolkit, ":", connectUrl, "Status:", connectionRequest.status);
          return NextResponse.json({
            success: true,
            url: connectUrl,
            status: connectionRequest.status || "initiated",
            toolkit,
            connectionId: connectionRequest.id || null,
          });
        } catch (e) {
          return NextResponse.json({
            error: "Connection failed",
            message: e instanceof Error ? e.message : "Unknown error",
            toolkit,
          }, { status: 400 });
        }
      }

      case "status": {
        try {
          const result = await session.toolkits({
            slugs: toolkit ? [toolkit] : undefined,
          });
          return NextResponse.json({ toolkits: result });
        } catch {
          return NextResponse.json({ toolkits: [] });
        }
      }

      case "mcp": {
        return NextResponse.json({
          url: session.mcp?.url || null,
          type: session.mcp?.type || "sse",
          headers: session.mcp?.headers || {},
          sessionId: session.sessionId,
        });
      }

      case "execute": {
        const { toolName, params } = body;
        try {
          const res = await fetch("https://backend.composio.dev/api/v3/tools/execute/direct", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.COMPOSIO_API_KEY || "",
            },
            body: JSON.stringify({
              tool_name: toolName,
              input: params || {},
              user_id: userId,
            }),
          });
          const data = await res.json();
          return NextResponse.json({ success: res.ok, result: data, tool: toolName });
        } catch (e) {
          return NextResponse.json({
            error: "Execution failed",
            message: e instanceof Error ? e.message : "Unknown",
          }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("Composio error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const configured = !!process.env.COMPOSIO_API_KEY;
  return NextResponse.json({
    status: configured ? "ready" : "not_configured",
    tools: configured ? "10,000+" : "0",
    message: configured
      ? "Composio ready — Gmail, Calendar, GitHub, Slack and 10,000+ more."
      : "Set COMPOSIO_API_KEY to enable integrations.",
  });
}
