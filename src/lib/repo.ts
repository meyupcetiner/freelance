// Okuma/yazma işlemleri. JSON alanları burada çözülür; görünümler düz nesnelerle çalışır.
import { q, now } from "./db";
import { emptyPricing, type Pricing, type Question } from "./pricing";

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
  sort: number;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Service {
  id: number;
  slug: string;
  category_id: number;
  category_slug: string;
  category_name: string;
  name: string;
  h1: string;
  seo_title: string;
  meta_description: string;
  summary: string;
  body: string;
  faq: Faq[];
  questions: Question[];
  pricing: Pricing;
  related: string[];
  image_url: string;
  image_alt: string;
  published: boolean;
  sort: number;
  updated_at: string;
}

const parse = <T>(s: string, fb: T): T => {
  try {
    return JSON.parse(s) ?? fb;
  } catch {
    return fb;
  }
};

function toService(r: any): Service {
  return {
    ...r,
    faq: parse(r.faq, []),
    questions: parse(r.questions, []),
    pricing: { ...emptyPricing(), ...parse(r.pricing, {}) },
    related: parse(r.related, []),
    published: !!r.published,
  };
}

const SERVICE_SQL = `SELECT s.*, c.slug AS category_slug, c.name AS category_name
  FROM services s JOIN categories c ON c.id = s.category_id`;

export const categories = () => q.all<Category>("SELECT * FROM categories ORDER BY sort, id");

export function services(opts: { publishedOnly?: boolean } = {}): Service[] {
  const where = opts.publishedOnly ? " WHERE s.published = 1" : "";
  return q.all(SERVICE_SQL + where + " ORDER BY c.sort, s.sort, s.id").map(toService);
}

export function serviceBySlug(slug: string, publishedOnly = true): Service | null {
  const r = q.get(SERVICE_SQL + " WHERE s.slug = ?" + (publishedOnly ? " AND s.published = 1" : ""), slug);
  return r ? toService(r) : null;
}

export function serviceById(id: number): Service | null {
  const r = q.get(SERVICE_SQL + " WHERE s.id = ?", id);
  return r ? toService(r) : null;
}

/** Form için istemciye gönderilecek minimum hizmet bilgisi. Doğrulanmamış rakamlar sunucuda kırpılır. */
export function publicServiceConfig() {
  return services({ publishedOnly: true }).map((s) => ({
    slug: s.slug,
    name: s.name,
    category: s.category_slug,
    questions: s.questions,
    pricing: s.pricing.enabled ? s.pricing : null,
  }));
}

// ---- Sayfalar ----
export interface Page {
  id: number;
  slug: string;
  title: string;
  seo_title: string;
  meta_description: string;
  body: string;
  is_legal: number;
  reviewed: number;
  published: number;
  updated_at: string;
}
export const pages = () => q.all<Page>("SELECT * FROM pages ORDER BY is_legal, title");
export const pageBySlug = (slug: string) => q.get<Page>("SELECT * FROM pages WHERE slug = ? AND published = 1", slug) ?? null;

// ---- Durumlar ----
export interface Status {
  id: number;
  key: string;
  label: string;
  tone: string;
  is_open: number;
  sort: number;
}
export const statuses = () => q.all<Status>("SELECT * FROM statuses ORDER BY sort, id");

// ---- Ayarlar ----
export interface Settings {
  brand_name: string;
  brand_tagline: string;
  logo_url: string;
  color_primary: string;
  color_primary_2: string;
  color_sky: string;
  color_signal: string;
  contact_email: string;
  contact_phone: string;
  contact_whatsapp: string;
  social_instagram: string;
  social_linkedin: string;
  social_youtube: string;
  seo_default_title: string;
  seo_default_description: string;
  og_image_url: string;
  ga4_id: string;
  gsc_verification: string;
  notify_email: string;
  legal_entity: string;
  service_area: string;
  retention_days: string;
}

export const DEFAULT_SETTINGS: Settings = {
  brand_name: "Brif",
  brand_tagline: "Fotoğraf, video ve dijital hizmetler için iş talebi",
  logo_url: "",
  color_primary: "#191919",
  color_primary_2: "#2F5FD6",
  color_sky: "#77EA2F",
  color_signal: "#77EA2F",
  contact_email: "",
  contact_phone: "",
  contact_whatsapp: "",
  social_instagram: "",
  social_linkedin: "",
  social_youtube: "",
  seo_default_title: "Brif: Fotoğraf, video, sosyal medya ve reklam hizmeti için talep oluştur",
  seo_default_description:
    "Ürün fotoğrafı, etkinlik çekimi, Reels, video kurgu, sosyal medya ve Meta reklam yönetimi için ihtiyacını anlat; kapsamına ve bütçene uygun geri dönüş al.",
  og_image_url: "",
  ga4_id: "",
  gsc_verification: "",
  notify_email: "",
  legal_entity: "",
  service_area: "İstanbul ve uzaktan yürütülebilen işler için Türkiye geneli",
  retention_days: "730",
};

let cache: { at: number; s: Settings } | null = null;
export function settings(): Settings {
  if (cache && Date.now() - cache.at < 5000) return cache.s;
  const rows = q.all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in s) (s as any)[r.key] = r.value;
  cache = { at: Date.now(), s };
  return s;
}

export function saveSettings(patch: Partial<Settings>) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    q.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", k, String(v ?? ""));
  }
  cache = null;
}

export const touch = () => now();
