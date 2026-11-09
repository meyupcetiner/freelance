// Ortam değişkenleri tek yerden okunur. Gizli değerler asla istemciye gönderilmez.
import { randomBytes } from "node:crypto";

const isProd = process.env.NODE_ENV === "production";

function required(name: string, devFallback: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (isProd) throw new Error(`Ortam değişkeni eksik: ${name}`);
  return devFallback;
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 3000),
  // Canonical, sitemap ve Open Graph için mutlak adres (sonunda / olmadan)
  siteUrl: (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  databasePath: process.env.DATABASE_PATH || "data/app.db",
  // Oturum/CSRF imzaları ve IP özetleri için. Üretimde en az 32 karakter rastgele değer.
  appSecret: required("APP_SECRET", "dev-secret-" + randomBytes(8).toString("hex")),
  // Ters vekil (Cloudflare, Nginx) arkasında gerçek IP başlığı. Boşsa soket adresi kullanılır.
  trustProxyHeader: (process.env.TRUST_PROXY_HEADER || "").toLowerCase(),
  // İsteğe bağlı servisler — tanımlı değilse ilgili özellik kapalıdır ve panelde öyle görünür.
  resendApiKey: process.env.RESEND_API_KEY || "",
  mailFrom: process.env.MAIL_FROM || "",
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY || "",
};

export const cookieSecure = config.siteUrl.startsWith("https://");
