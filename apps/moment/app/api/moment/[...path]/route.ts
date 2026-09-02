import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE_PROD = "__Host-moment_session";
const COOKIE_DEV = "moment_session";
const TRUSTED_COOKIE_PROD = "__Host-moment_trusted";
const TRUSTED_COOKIE_DEV = "moment_trusted";

function apiBase() {
  return (
    process.env.API_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001"
  );
}

function cookieNames() {
  return process.env.NODE_ENV === "production"
    ? { session: COOKIE_PROD, trusted: TRUSTED_COOKIE_PROD }
    : { session: COOKIE_DEV, trusted: TRUSTED_COOKIE_DEV };
}

function upstreamHeaders(request: NextRequest) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const userAgent = request.headers.get("user-agent");
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (contentType) headers.set("Content-Type", contentType);
  if (userAgent) headers.set("User-Agent", userAgent);
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);
  return headers;
}

function setSessionCookie(
  response: NextResponse,
  name: string,
  value: string,
  maxAge: number,
) {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
    priority: "high",
  });
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  const cookieStore = await cookies();
  const names = cookieNames();
  const trustedToken =
    cookieStore.get(TRUSTED_COOKIE_PROD)?.value ||
    cookieStore.get(TRUSTED_COOKIE_DEV)?.value;

  if (endpoint === "auth/logout" && request.method === "POST") {
    if (trustedToken) {
      const revokeHeaders = upstreamHeaders(request);
      const publicToken = process.env.MOMENT_PUBLIC_API_TOKEN;
      if (publicToken) revokeHeaders.set("X-Moment-Public-Token", publicToken);
      revokeHeaders.set("X-Moment-Trusted-Token", trustedToken);
      await fetch(`${apiBase()}/moment/auth/trusted/revoke`, {
        method: "POST",
        headers: revokeHeaders,
        cache: "no-store",
      }).catch(() => null);
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(COOKIE_PROD);
    response.cookies.delete(COOKIE_DEV);
    response.cookies.delete(TRUSTED_COOKIE_PROD);
    response.cookies.delete(TRUSTED_COOKIE_DEV);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  let session =
    cookieStore.get(COOKIE_PROD)?.value || cookieStore.get(COOKIE_DEV)?.value;
  const publicToken = process.env.MOMENT_PUBLIC_API_TOKEN;
  const headers = upstreamHeaders(request);
  let refreshedSession: { token: string; expiresIn: number } | null = null;
  let discardTrustedCookie = false;
  let discardSessionCookie = false;

  async function refreshFromTrustedDevice() {
    if (!trustedToken) return null;
    const refreshHeaders = upstreamHeaders(request);
    if (publicToken) refreshHeaders.set("X-Moment-Public-Token", publicToken);
    refreshHeaders.set("X-Moment-Trusted-Token", trustedToken);
    const refreshResponse = await fetch(
      `${apiBase()}/moment/auth/trusted/refresh`,
      {
        method: "POST",
        headers: refreshHeaders,
        cache: "no-store",
      },
    ).catch(() => null);
    if (!refreshResponse?.ok) return null;
    return (await refreshResponse.json()) as {
      token: string;
      expiresIn: number;
    };
  }

  if (!session && trustedToken && endpoint !== "auth/login") {
    refreshedSession = await refreshFromTrustedDevice();
    if (refreshedSession) {
      session = refreshedSession.token;
    } else {
      discardTrustedCookie = true;
    }
  }

  if (session) headers.set("Authorization", `Bearer ${session}`);
  else if (publicToken) headers.set("X-Moment-Public-Token", publicToken);

  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();
  let upstream = await fetch(
    `${apiBase()}/moment/${endpoint}${request.nextUrl.search}`,
    {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);

  if (
    upstream?.status === 401 &&
    session &&
    trustedToken &&
    !refreshedSession &&
    endpoint !== "auth/login"
  ) {
    discardSessionCookie = true;
    refreshedSession = await refreshFromTrustedDevice();
    if (refreshedSession) {
      headers.set("Authorization", `Bearer ${refreshedSession.token}`);
    } else {
      discardTrustedCookie = true;
      headers.delete("Authorization");
      if (publicToken) headers.set("X-Moment-Public-Token", publicToken);
    }
    upstream = await fetch(
      `${apiBase()}/moment/${endpoint}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
      },
    ).catch(() => null);
  }
  if (upstream?.status === 401 && session && !trustedToken) {
    discardSessionCookie = true;
  }

  if (!upstream)
    return NextResponse.json(
      { message: "Moment API 暂时不可用" },
      { status: 503 },
    );

  if (endpoint === "auth/login" && upstream.ok) {
    const result = (await upstream.json()) as {
      token: string;
      expiresIn: number;
      trustedToken?: string;
      trustedExpiresIn?: number;
    };
    const response = NextResponse.json({
      ok: true,
      expiresIn: result.expiresIn,
    });
    setSessionCookie(response, names.session, result.token, result.expiresIn);
    if (result.trustedToken && result.trustedExpiresIn) {
      setSessionCookie(
        response,
        names.trusted,
        result.trustedToken,
        result.trustedExpiresIn,
      );
    }
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
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
  if (refreshedSession) {
    setSessionCookie(
      response,
      names.session,
      refreshedSession.token,
      refreshedSession.expiresIn,
    );
  }
  if (discardTrustedCookie) {
    response.cookies.delete(TRUSTED_COOKIE_PROD);
    response.cookies.delete(TRUSTED_COOKIE_DEV);
  }
  if (discardSessionCookie && !refreshedSession) {
    response.cookies.delete(COOKIE_PROD);
    response.cookies.delete(COOKIE_DEV);
  }
  return response;
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
