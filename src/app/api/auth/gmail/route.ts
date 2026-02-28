import { NextRequest, NextResponse } from "next/server";

// Gmail OAuth2 — User must explicitly authorize access
// Scopes: readonly (we never modify emails)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.NEXTAUTH_URL
  ? `${process.env.NEXTAUTH_URL}/api/auth/gmail/callback`
  : "http://localhost:3333/api/auth/gmail/callback";

const SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly";

// GET = start OAuth flow → redirect to Google consent
export async function GET() {
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: "Gmail not configured. Set GOOGLE_CLIENT_ID in .env.local" }, { status: 501 });
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authUrl.toString());
}

// POST = exchange code for token OR search/read gmail
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Exchange auth code for access token
  if (body.code) {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: body.code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) {
      return NextResponse.json({ error: tokens.error_description || tokens.error }, { status: 400 });
    }
    return NextResponse.json({ access_token: tokens.access_token, expires_in: tokens.expires_in });
  }

  // Search Gmail
  if (body.action === "search" && body.token) {
    const query = body.query || "is:unread";
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
      { headers: { Authorization: `Bearer ${body.token}` } }
    );
    const data = await res.json();
    if (!data.messages) return NextResponse.json({ results: [] });

    // Fetch message details
    const results = [];
    for (const msg of data.messages.slice(0, 5)) {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${body.token}` } }
      );
      const detail = await detailRes.json();
      const headers = detail.payload?.headers || [];
      results.push({
        id: msg.id,
        subject: headers.find((h: {name: string}) => h.name === "Subject")?.value || "(no subject)",
        from: headers.find((h: {name: string}) => h.name === "From")?.value || "",
        date: headers.find((h: {name: string}) => h.name === "Date")?.value || "",
        snippet: detail.snippet || "",
      });
    }
    return NextResponse.json({ results });
  }

  // Read specific email
  if (body.action === "read" && body.token && body.messageId) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${body.messageId}?format=full`,
      { headers: { Authorization: `Bearer ${body.token}` } }
    );
    const detail = await res.json();
    // Extract plain text body
    let textBody = detail.snippet || "";
    const parts = detail.payload?.parts || [];
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        textBody = Buffer.from(part.body.data, "base64url").toString("utf8");
        break;
      }
    }
    const headers = detail.payload?.headers || [];
    return NextResponse.json({
      subject: headers.find((h: {name: string}) => h.name === "Subject")?.value || "",
      from: headers.find((h: {name: string}) => h.name === "From")?.value || "",
      date: headers.find((h: {name: string}) => h.name === "Date")?.value || "",
      body: textBody.slice(0, 3000),
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
