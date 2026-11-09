// Parola özeti, oturumlar, CSRF jetonları, yetki kontrolü ve hız sınırı.
import { createHash, createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config";
import { q, now } from "./db";
import { Ctx, HttpError, ipKey, setCookie } from "./http";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const key = Buffer.from(keyB64, "base64");
  const got = await scrypt(pw.normalize("NFKC"), Buffer.from(saltB64, "base64"), key.length, { ...SCRYPT, N: Number(n) });
  return timingSafeEqual(key, got);
}

// ---- Oturumlar ----
export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 7;

export type Role = "admin" | "editor";
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  sessionHash: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function createSession(ctx: Ctx, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  q.run("INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", sha(token), userId, now(), exp);
  q.run("UPDATE users SET last_login_at = ? WHERE id = ?", now(), userId);
  setCookie(ctx, SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 });
}

export function destroySession(ctx: Ctx) {
  const t = ctx.cookies[SESSION_COOKIE];
  if (t) q.run("DELETE FROM sessions WHERE id_hash = ?", sha(t));
  setCookie(ctx, SESSION_COOKIE, "", { maxAge: 0 });
}

export function currentUser(ctx: Ctx): User | null {
  const t = ctx.cookies[SESSION_COOKIE];
  if (!t || t.length > 100) return null;
  const h = sha(t);
  const row = q.get<any>(
    `SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = ? AND u.active = 1`,
    h,
  );
  if (!row) return null;
  if (row.expires_at < now()) {
    q.run("DELETE FROM sessions WHERE id_hash = ?", h);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, sessionHash: h };
}

/** Sunucu tarafında yetki kontrolü. Arayüzde buton gizlemek yeterli değildir; her işlem buradan geçer. */
export function requireUser(ctx: Ctx, roles: Role[] = ["admin", "editor"]): User {
  const u = currentUser(ctx);
  if (!u) throw new HttpError(401, "Oturum gerekli.");
  if (!roles.includes(u.role)) throw new HttpError(403, "Bu işlem için yetkiniz yok.");
  return u;
}

// ---- CSRF: oturuma bağlı HMAC jeton (Origin kontrolüne ek ikinci katman) ----
export function csrfToken(u: User): string {
  return createHmac("sha256", config.appSecret).update("csrf:" + u.sessionHash).digest("base64url");
}

export function assertCsrf(u: User, token: string | null) {
  const exp = Buffer.from(csrfToken(u));
  const got = Buffer.from(token || "");
  if (exp.length !== got.length || !timingSafeEqual(exp, got)) throw new HttpError(403, "Form süresi doldu. Sayfayı yenileyip tekrar deneyin.");
}

// ---- Hız sınırı (veritabanında kayan pencere; sunucusuz/çok süreçli ortamda da çalışır) ----
export function rateLimit(ctx: Ctx, action: string, max: number, windowSec: number): boolean {
  const key = action + ":" + ipKey(ctx.ip);
  const t = Math.floor(Date.now() / 1000);
  const c = q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND ts > ?", key, t - windowSec)!;
  if (c.n >= max) return false;
  q.run("INSERT INTO rate_limits (key, ts) VALUES (?, ?)", key, t);
  return true;
}

export function audit(userId: number | null, action: string, target = "") {
  q.run("INSERT INTO audit_log (user_id, action, target, created_at) VALUES (?, ?, ?, ?)", userId, action, target, now());
}

/** Periyodik temizlik: süresi dolan oturumlar, eski hız sınırı kayıtları, saklama süresi geçen analitik olaylar. */
export function housekeeping() {
  const t = Math.floor(Date.now() / 1000);
  q.run("DELETE FROM sessions WHERE expires_at < ?", now());
  q.run("DELETE FROM rate_limits WHERE ts < ?", t - 86400);
  const cutoff = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  q.run("DELETE FROM events WHERE day < ?", cutoff);
  q.run("DELETE FROM audit_log WHERE created_at < ?", new Date(Date.now() - 365 * 864e5).toISOString());
}
