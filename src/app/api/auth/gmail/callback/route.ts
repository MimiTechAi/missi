import { NextRequest } from "next/server";

// OAuth2 callback — exchanges code and redirects back with token
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return new Response("<h1>Authorization failed</h1>", { status: 400, headers: { "Content-Type": "text/html" } });
  }

  // Send code back to the main app via postMessage
  const html = `<!DOCTYPE html>
<html><body>
<h2>✅ Gmail Connected!</h2>
<p>This window will close automatically...</p>
<script>
  window.opener?.postMessage({ type: "gmail_auth", code: "${code}" }, "*");
  setTimeout(() => window.close(), 1500);
</script>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
