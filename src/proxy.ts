import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const isLoginPage = req.nextUrl.pathname === "/login";

  const hasSupabaseCookie = req.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));

  if (!hasSupabaseCookie && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (hasSupabaseCookie && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};