import { NextResponse } from "next/server";

function apiUrl() {
  return process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

export async function POST(request: Request) {
  const body = await request.text();
  const response = await fetch(`${apiUrl()}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": request.headers.get("user-agent") || "",
      "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
    },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json(payload, { status: response.status });

  const result = NextResponse.json({ authenticated: true });
  const secure = process.env.NODE_ENV === "production";
  result.cookies.set("auth_token", payload.token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 2 * 60 * 60,
  });
  if (payload.trustedToken) {
    const seconds = Math.max(
      60,
      Math.floor((new Date(payload.trustedExpiresAt).getTime() - Date.now()) / 1000),
    );
    result.cookies.set("admin_trusted", payload.trustedToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: seconds,
    });
  }
  return result;
}
