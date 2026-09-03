const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

export function proxyRequestHeaders(source: Headers) {
  const headers = new Headers(source);
  headers.delete("cookie");
  headers.delete("host");
  headers.delete("content-length");
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  return headers;
}

export function proxyResponseHeaders(source: Headers) {
  const headers = new Headers(source);
  headers.delete("content-encoding");
  headers.delete("content-length");
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  return headers;
}
