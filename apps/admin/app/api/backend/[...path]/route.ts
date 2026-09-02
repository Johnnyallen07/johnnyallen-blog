import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function apiUrl() {
  return process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const jar = await cookies();
  let token = jar.get("auth_token")?.value;
  const trusted = jar.get("admin_trusted")?.value;
  let renewed = false;
  const refresh = async () => {
    if (!trusted) return null;
    const response = await fetch(`${apiUrl()}/auth/trusted/refresh`, {
      method: "POST",
      headers: {
        "X-Admin-Trusted-Token": trusted,
        "User-Agent": request.headers.get("user-agent") || "",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
    });
    return response.ok ? response.json() as Promise<{ token: string }> : null;
  };
  if (!token) {
    const value = await refresh();
    token = value?.token;
    renewed = Boolean(token);
  }
  if (!token) return NextResponse.json({ message: "登录已过期" }, { status: 401 });
  const target = new URL(`${apiUrl()}/${path.join("/")}`);
  target.search = request.nextUrl.search;
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");
  headers.set("Authorization", `Bearer ${token}`);
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.arrayBuffer();
  let response = await fetch(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });
  if (response.status === 401) {
    const value = await refresh();
    if (value?.token) {
      token = value.token;
      renewed = true;
      headers.set("Authorization", `Bearer ${token}`);
      response = await fetch(target, { method: request.method, headers, body, redirect: "manual", cache: "no-store" });
    }
  }
  const outgoing = new Headers(response.headers);
  outgoing.delete("content-encoding");
  outgoing.delete("content-length");
  const result = new NextResponse(response.body, { status: response.status, headers: outgoing });
  if (renewed) result.cookies.set("auth_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 2 * 60 * 60 });
  return result;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
