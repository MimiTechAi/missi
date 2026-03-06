import { NextRequest, NextResponse } from "next/server";

// ============================================================
// SECURITY MIDDLEWARE — Protects all API routes
// ============================================================
// MISSI Demo Mode: Composio integrations (Gmail, Calendar, GitHub)
// are DISABLED for public visitors. Only the demo owner can use
// real integrations by setting MISSI_DEMO_SECRET.
//
// Public visitors get: Chat, Voice, Web Search, Weather, etc.
// Protected: Gmail, Calendar, GitHub, Composio (real data access)
// ============================================================

const PROTECTED_PATHS = [
  "/api/auth/gmail",
  "/api/composio",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(p => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect sensitive API routes
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // Check for demo secret in cookie or header
  const demoSecret = process.env.MISSI_DEMO_SECRET;
  
  // If no secret configured, block all protected routes in production
  if (!demoSecret) {
    return NextResponse.json(
      { 
        error: "Integration disabled",
        message: "Gmail, Calendar, and GitHub integrations are disabled in demo mode for security. Use the chat, voice, and web tools instead!"
      },
      { status: 403 }
    );
  }

  // Check cookie or Authorization header
  const cookieSecret = req.cookies.get("missi_auth")?.value;
  const headerSecret = req.headers.get("x-missi-auth");
  
  if (cookieSecret === demoSecret || headerSecret === demoSecret) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      error: "Unauthorized",
      message: "You need to authenticate to use Gmail, Calendar, and GitHub integrations."
    },
    { status: 401 }
  );
}

export const config = {
  matcher: [
    "/api/auth/gmail/:path*",
    "/api/composio/:path*",
  ],
};
