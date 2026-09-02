import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function apiUrl() {
  return process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

export async function POST() {
  const jar = await cookies();
  const trusted = jar.get("admin_trusted")?.value;
  if (trusted) {
    await fetch(`${apiUrl()}/auth/trusted/revoke`, {
      method: "POST",
      headers: { "X-Admin-Trusted-Token": trusted },
    }).catch(() => undefined);
  }
  const result = NextResponse.json({ loggedOut: true });
  result.cookies.delete("auth_token");
  result.cookies.delete("admin_trusted");
  return result;
}
