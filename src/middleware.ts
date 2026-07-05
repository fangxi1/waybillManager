import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hasSession = request.cookies.get("v3_user_id");
  if (!hasSession && !request.nextUrl.pathname.startsWith("/api/auth")) {
    const response = NextResponse.next();
    response.cookies.set("v3_user_id", "u-reporter", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
