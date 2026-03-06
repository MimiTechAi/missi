import { NextRequest, NextResponse } from "next/server";

// ============================================================
// SECURITY MIDDLEWARE — Per-user session isolation
// ============================================================
// Every visitor gets a unique user ID via cookie.
// This ensures:
// 1. Each user connects their OWN tools (Gmail, Calendar, GitHub)
// 2. No data leakage between users
// 3. Owner's data is never exposed to visitors
// ============================================================

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  // Assign unique user ID if not present
  if (!req.cookies.get("missi_uid")) {
    const uid = `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    res.cookies.set("missi_uid", uid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });
  }

  // Security headers (defense-in-depth)
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return res;
}

export const config = {
  matcher: [
    // Match all routes except static files
    "/((?!_next/static|_next/image|favicon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|ico)$).*)",
  ],
};
