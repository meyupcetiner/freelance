import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import { config, cookieSecure } from "./config";

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  params: Record<string, string>;
  ip: string;
  cookies: Record<string, string>;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_BODY = 64 * 1024; // 64 KB: talep formu için fazlasıyla yeterli

export async function readBody(ctx: Ctx): Promise<string> {
  const len = Number(ctx.req.headers["content-length"] || 0);
  if (len > MAX_BODY) throw new HttpError(413, "İstek gövdesi çok büyük.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of ctx.req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "İstek gövdesi çok büyük.");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJson(ctx: Ctx): Promise<any> {
  const ct = String(ctx.req.headers["content-type"] || "");
  if (!ct.startsWith("application/json")) throw new HttpError(415, "JSON bekleniyor.");
  try {
    return JSON.parse(await readBody(ctx));
  } catch {
    throw new HttpError(400, "Geçersiz JSON.");
  }
}

export async function readForm(ctx: Ctx): Promise<URLSearchParams> {
  const ct = String(ctx.req.headers["content-type"] || "");
  if (!ct.startsWith("application/x-www-form-urlencoded")) throw new HttpError(415, "Form verisi bekleniyor.");
  return new URLSearchParams(await readBody(ctx));
}

export function parseCookies(h: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* bozuk çerez yok sayılır */
    }
  }
  return out;
}

export function setCookie(ctx: Ctx, name: string, value: string, opts: { maxAge?: number; httpOnly?: boolean } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (cookieSecure) parts.push("Secure");
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  const prev = ctx.res.getHeader("Set-Cookie");
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  ctx.res.setHeader("Set-Cookie", [...list, parts.join("; ")]);
}

export function clientIp(req: IncomingMessage): string {
  const h = config.trustProxyHeader;
  if (h) {
    const v = req.headers[h];
    const s = Array.isArray(v) ? v[0] : v;
    if (s) return s.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "0.0.0.0";
}

/** IP'yi gizli anahtarla özetler; ham IP hiçbir tabloda tutulmaz. */
export function ipKey(ip: string): string {
  return createHmac("sha256", config.appSecret).update("ip:" + ip).digest("base64url").slice(0, 22);
}

/** Durum değiştiren isteklerde aynı kaynak (Origin/Referer) zorunludur — CSRF'e karşı ilk savunma hattı. */
export function assertSameOrigin(ctx: Ctx) {
  const origin = ctx.req.headers.origin || "";
  const referer = ctx.req.headers.referer || "";
  const host = ctx.req.headers.host || "";
  const allowed = new Set([config.siteUrl, `http://${host}`, `https://${host}`]);
  let src = origin;
  if (!src && referer) {
    try {
      src = new URL(referer).origin;
    } catch {
      src = "";
    }
  }
  if (!src || !allowed.has(src)) throw new HttpError(403, "İstek kaynağı doğrulanamadı.");
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
};

export function applySecurityHeaders(res: ServerResponse) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (cookieSecure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

export function send(ctx: Ctx, status: number, body: string | Buffer, type = "text/html; charset=utf-8", extra: Record<string, string> = {}) {
  ctx.res.statusCode = status;
  ctx.res.setHeader("Content-Type", type);
  for (const [k, v] of Object.entries(extra)) ctx.res.setHeader(k, v);
  ctx.res.end(body);
}

export function json(ctx: Ctx, status: number, data: unknown) {
  send(ctx, status, JSON.stringify(data), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
}

export function redirect(ctx: Ctx, to: string, status = 303) {
  ctx.res.statusCode = status;
  ctx.res.setHeader("Location", to);
  ctx.res.end();
}
