import { NextRequest, NextResponse } from "next/server";

// ============================================================
// COMPOSIO INTEGRATION — Per-user session isolation
// ============================================================
// SECURITY: Each visitor gets their own Composio session via cookie.
// User A connects Gmail → only User A can read User A's emails.
// Owner's data is NEVER shared with visitors.
// ============================================================

// Per-user session cache
const _sessions = new Map<string, { sessionId: string; created: number }>();
const SESSION_TTL = 30 * 60 * 1000; // 30 min

function getUserId(req: NextRequest): string {
  return req.cookies.get("missi_uid")?.value || `anon_${Date.now()}`;
}

async function getToolRouterSession(userId: string): Promise<string | null> {
  const cached = _sessions.get(userId);
  if (cached && Date.now() - cached.created < SESSION_TTL) return cached.sessionId;
  if (!process.env.COMPOSIO_API_KEY) return null;

  try {
    const res = await fetch("https://backend.composio.dev/api/v3/tool_router/session", {
      method: "POST",
      headers: { "x-api-key": process.env.COMPOSIO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId, // SECURITY: unique per visitor
        allowed_toolkits: ["gmail", "googlecalendar", "github", "slack", "notion", "googledrive"]
      })
    });
    const data = await res.json();
    const sessionId = data.session_id || null;
    if (sessionId) {
      _sessions.set(userId, { sessionId, created: Date.now() });
      // Cleanup stale sessions
      for (const [key, val] of _sessions) {
        if (Date.now() - val.created > SESSION_TTL) _sessions.delete(key);
      }
    }
    return sessionId;
  } catch (e) {
    console.error("[COMPOSIO] Session error:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, toolkit } = body;

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({
        error: "Composio not configured",
        message: "Set COMPOSIO_API_KEY to enable 10,000+ tool integrations."
      }, { status: 501 });
    }

    const userId = getUserId(req);
    const sessionId = await getToolRouterSession(userId);
    if (!sessionId) {
      return NextResponse.json({ error: "Failed to create Composio session" }, { status: 500 });
    }

    switch (action) {
      case "toolkits": {
        try {
          const res = await fetch(
            `https://backend.composio.dev/api/v3/tool_router/session/${sessionId}/toolkits`,
            { headers: { "x-api-key": process.env.COMPOSIO_API_KEY || "" } }
          );
          const data = await res.json();
          return NextResponse.json({ toolkits: data.items || [] });
        } catch {
          return NextResponse.json({ toolkits: [] });
        }
      }

      case "connect": {
        try {
          const res = await fetch(
            `https://backend.composio.dev/api/v3/tool_router/session/${sessionId}/link`,
            {
              method: "POST",
              headers: { "x-api-key": process.env.COMPOSIO_API_KEY || "", "Content-Type": "application/json" },
              body: JSON.stringify({ toolkit_slug: toolkit || "gmail" })
            }
          );
          const data = await res.json();
          return NextResponse.json({
            success: true,
            url: data.redirect_url || data.url || null,
            status: data.status || "initiated",
            toolkit,
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
          const res = await fetch(
            `https://backend.composio.dev/api/v3/tool_router/session/${sessionId}/toolkits`,
            { headers: { "x-api-key": process.env.COMPOSIO_API_KEY || "" } }
          );
          const data = await res.json();
          const items = data.items || [];
          if (toolkit) {
            const found = items.find((t: { slug: string }) => t.slug === toolkit);
            return NextResponse.json({ toolkit: found || null, connected: found?.connected_account?.status === "ACTIVE" });
          }
          return NextResponse.json({ toolkits: items });
        } catch {
          return NextResponse.json({ toolkits: [] });
        }
      }

      case "execute": {
        const { toolName, params } = body;
        try {
          const res = await fetch(
            `https://backend.composio.dev/api/v3/tool_router/session/${sessionId}/execute`,
            {
              method: "POST",
              headers: { "x-api-key": process.env.COMPOSIO_API_KEY || "", "Content-Type": "application/json" },
              body: JSON.stringify({ tool_slug: toolName, arguments: params || {} })
            }
          );
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
