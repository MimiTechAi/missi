import { NextRequest } from "next/server";

// OAuth2 callback — exchanges code and redirects back with token
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return new Response("<h1>Authorization failed</h1>", { status: 400, headers: { "Content-Type": "text/html" } });
  }

  // Send code back to the main app via postMessage
  // SECURITY: Use specific origin instead of "*" to prevent code interception
  const appOrigin = process.env.NEXTAUTH_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : "http://localhost:3333";
  
  const html = `<!DOCTYPE html>
<html><body>
<h2>✅ Gmail Connected!</h2>
<p>This window will close automatically...</p>
<script>
  window.opener?.postMessage({ type: "gmail_auth", code: "${code}" }, "${appOrigin}");
  setTimeout(() => window.close(), 1500);
</script>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
