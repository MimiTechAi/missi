import { NextRequest, NextResponse } from "next/server";

// Tool Router Session cache
let _sessionId: string | null = null;
let _sessionCreated = 0;

async function getToolRouterSession(): Promise<string | null> {
  // Reuse session for 30 min
  if (_sessionId && Date.now() - _sessionCreated < 30 * 60 * 1000) return _sessionId;
  if (!process.env.COMPOSIO_API_KEY) return null;

  try {
    const res = await fetch("https://backend.composio.dev/api/v3/tool_router/session", {
      method: "POST",
      headers: { "x-api-key": process.env.COMPOSIO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "missi_demo_user",
        allowed_toolkits: ["gmail", "googlecalendar", "github", "slack", "notion", "googledrive"]
      })
    });
    const data = await res.json();
    _sessionId = data.session_id || null;
    _sessionCreated = Date.now();
    return _sessionId;
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

    const sessionId = await getToolRouterSession();
    if (!sessionId) {
      return NextResponse.json({ error: "Failed to create Composio session" }, { status: 500 });
    }

    switch (action) {
      case "toolkits": {
        // Get actual toolkit status from Tool Router
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
          // Use Tool Router link endpoint to create connection
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
