import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function apiUrl() {
  return process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

const secure = process.env.NODE_ENV === "production";

async function refreshMoment(trusted: string, request: NextRequest) {
  const response = await fetch(`${apiUrl()}/moment/auth/trusted/refresh`, {
    method: "POST",
    headers: {
      "X-Moment-Trusted-Token": trusted,
      "User-Agent": request.headers.get("user-agent") || "",
      "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
    },
  });
  return response.ok ? response.json() as Promise<{ token: string }> : null;
}

async function handler(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const joined = path.join("/");
  const jar = await cookies();
  const adminToken = jar.get("auth_token")?.value;
  const trusted = jar.get("moment_admin_trusted")?.value;

  if (joined === "auth/login") {
    if (!adminToken) return NextResponse.json({ message: "后台登录已过期" }, { status: 401 });
    const response = await fetch(`${apiUrl()}/moment/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "User-Agent": request.headers.get("user-agent") || "",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
      body: await request.text(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json(payload, { status: response.status });
    const result = NextResponse.json({ authenticated: true });
    result.cookies.set("moment_admin_session", payload.token, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 2 * 60 * 60 });
    if (payload.trustedToken) {
      result.cookies.set("moment_admin_trusted", payload.trustedToken, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 7 * 24 * 60 * 60 });
    }
    return result;
  }

  let session = jar.get("moment_admin_session")?.value;
  let renewed = false;
  if (!session && trusted) {
    const value = await refreshMoment(trusted, request);
    session = value?.token;
    renewed = Boolean(session);
  }
  if (!session) return NextResponse.json({ message: "需要重新验证 Moment" }, { status: 401 });

  const target = new URL(`${apiUrl()}/moment/${joined}`);
  target.search = request.nextUrl.search;
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");
  headers.set("Authorization", `Bearer ${session}`);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  let response = await fetch(target, { method: request.method, headers, body, redirect: "manual", cache: "no-store" });
  if (response.status === 401 && trusted) {
    const value = await refreshMoment(trusted, request);
    if (value?.token) {
      session = value.token;
      renewed = true;
      headers.set("Authorization", `Bearer ${session}`);
      response = await fetch(target, { method: request.method, headers, body, redirect: "manual", cache: "no-store" });
    }
  }
  const outgoing = new Headers(response.headers);
  outgoing.delete("content-encoding");
  outgoing.delete("content-length");
  const result = new NextResponse(response.body, { status: response.status, headers: outgoing });
  if (renewed && session) result.cookies.set("moment_admin_session", session, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 2 * 60 * 60 });
  return result;
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
