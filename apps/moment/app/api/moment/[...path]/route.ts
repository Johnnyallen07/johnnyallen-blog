import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE_PROD = "__Host-moment_session";
const COOKIE_DEV = "moment_session";

function apiBase() {
  return (
    process.env.API_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001"
  );
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  const cookieStore = await cookies();

  if (endpoint === "auth/logout" && request.method === "POST") {
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(COOKIE_PROD);
    response.cookies.delete(COOKIE_DEV);
    return response;
  }

  const session =
    cookieStore.get(COOKIE_PROD)?.value || cookieStore.get(COOKIE_DEV)?.value;
  const publicToken = process.env.MOMENT_PUBLIC_API_TOKEN;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  if (session) headers.set("Authorization", `Bearer ${session}`);
  else if (publicToken) headers.set("X-Moment-Public-Token", publicToken);

  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();
  const upstream = await fetch(
    `${apiBase()}/moment/${endpoint}${request.nextUrl.search}`,
    {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);

  if (!upstream)
    return NextResponse.json(
      { message: "Moment API 暂时不可用" },
      { status: 503 },
    );

  if (endpoint === "auth/login" && upstream.ok) {
    const result = (await upstream.json()) as {
      token: string;
      expiresIn: number;
    };
    const response = NextResponse.json({
      ok: true,
      expiresIn: result.expiresIn,
    });
    response.cookies.set(
      process.env.NODE_ENV === "production" ? COOKIE_PROD : COOKIE_DEV,
      result.token,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: result.expiresIn,
      },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const responseHeaders = new Headers();
  for (const key of [
    "content-type",
    "content-length",
    "content-disposition",
    "cache-control",
    "x-content-type-options",
  ]) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (!responseHeaders.has("Cache-Control"))
    responseHeaders.set("Cache-Control", "no-store");
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
