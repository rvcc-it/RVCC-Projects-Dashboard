import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate: unauthenticated visitors are sent to /login before any page renders.
// This only checks that a session cookie EXISTS. Real validation (DB lookup, expiry, active user,
// permissions) happens in server components, server actions and route handlers -- never trust this alone.
const PUBLIC = ["/login", "/forgot-password", "/reset-password"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("rvcc_session");
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!hasSession && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  // NOTE: never redirect away from /login based on the cookie alone - a revoked/expired session still has a cookie
  // and that would create a redirect loop. The login page validates the session itself.
  return NextResponse.next();
}

export const config = {
  // API routes authenticate themselves (and must not be body-buffered by the proxy)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|pdf.worker.min.mjs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
