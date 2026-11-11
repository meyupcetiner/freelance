// Ziyaretçi sayacı ve rapor (çerezsiz; IP saklanmaz). parcamnerde'deki sistemin Brif uyarlaması.
// Ziyaretçi kimliği: gizli tuz + gün + IP + tarayıcı özetinin kısa hash'i (gün değişince sıfırlanır).
// Admin'e giriş yapan cihaz 30 gün boyunca sayıma katılmaz; botlar ayrı işaretlenir.

interface D1Stmt { bind(...v: unknown[]): D1Stmt; first<T = any>(): Promise<T | null>; all<T = any>(): Promise<{ results: T[] }>; run(): Promise<unknown> }
interface DB { prepare(q: string): D1Stmt }

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|mediapartners|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|python|curl|wget|httpclient|okhttp|axios|node-fetch|go-http|java\/|facebookexternalhit|whatsapp\/|telegrambot|preview|monitor|uptime|scan|check|validator|feedfetcher|ahrefs|semrush|mj12|dotbot|petal|yandex(?!browser)|baidu|bytespider|gptbot|claude|anthropic|perplexity|ccbot|amazonbot|applebot/i;
const DAY = 864e5;
const TR = 3 * 36e5; // İstanbul saati

async function hash(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const devOf = (ua: string) =>
  /iPad|Tablet/i.test(ua) ? "Tablet" : /iPhone/i.test(ua) ? "iPhone" : /Android/i.test(ua) ? (/Mobile/i.test(ua) ? "Android" : "Tablet") : /Mobi/i.test(ua) ? "Telefon" : /Mac OS/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : "Bilgisayar";

function srcOf(ref: string, ua: string, utm: string) {
  if (utm) return utm.slice(0, 40);
  let host = "";
  try { host = new URL(ref).hostname.replace(/^www\./, ""); } catch { /* boş */ }
  if (/Instagram/i.test(ua) && (!host || /instagram/.test(host))) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua) && (!host || /facebook|fb\./.test(host))) return "Facebook";
  if (!host) return "Doğrudan";
  if (/getbrif\.com$|workers\.dev$/.test(host)) return "";
  const M: [RegExp, string][] = [[/google\./, "Google"], [/bing\.com/, "Bing"], [/yandex\./, "Yandex"], [/duckduckgo/, "DuckDuckGo"], [/instagram/, "Instagram"], [/facebook|fb\.com|fb\.me/, "Facebook"], [/linkedin/, "LinkedIn"], [/^t\.co$|twitter|x\.com/, "X"], [/whatsapp|wa\.me/, "WhatsApp"], [/tiktok/, "TikTok"], [/youtube/, "YouTube"], [/chatgpt|openai/, "ChatGPT"], [/perplexity/, "Perplexity"]];
  for (const [r, n] of M) if (r.test(host)) return n;
  return host.slice(0, 40);
}

let ready = false;
let SALT = "";
async function setup(db: DB) {
  if (ready) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS ziyaretler (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, vid TEXT NOT NULL, p TEXT NOT NULL, ti TEXT NOT NULL DEFAULT '', e TEXT NOT NULL DEFAULT '', src TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', dev TEXT NOT NULL DEFAULT '', x INTEGER NOT NULL DEFAULT 0)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS ziyaretler_t ON ziyaretler (t)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS admin_cihaz (k TEXT PRIMARY KEY, t INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS kurulum (anahtar TEXT PRIMARY KEY, created_at TEXT NOT NULL)").run();
  let r = await db.prepare("SELECT anahtar FROM kurulum WHERE anahtar LIKE 'ziyaret-tuz:%'").first<{ anahtar: string }>();
  if (!r) {
    const k = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await db.prepare("INSERT OR IGNORE INTO kurulum (anahtar, created_at) VALUES (?, ?)").bind("ziyaret-tuz:" + k, new Date().toISOString()).run();
    r = await db.prepare("SELECT anahtar FROM kurulum WHERE anahtar LIKE 'ziyaret-tuz:%'").first<{ anahtar: string }>();
  }
  SALT = String(r?.anahtar || "").slice(12);
  ready = true;
}

const deviceKey = (req: Request) => hash("a|" + (req.headers.get("CF-Connecting-IP") || "") + "|" + (req.headers.get("User-Agent") || ""));

/** Admin'de gezinen cihazı işaretle (bu cihazın ziyaretleri sayılmaz). Saatte bir yazar. */
const marked = new Map<string, number>();
export async function markAdmin(req: Request, db: DB) {
  try {
    const k = await deviceKey(req);
    if (Date.now() - (marked.get(k) || 0) < 36e5) return;
    await setup(db);
    await db.prepare("INSERT INTO admin_cihaz (k, t) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET t = excluded.t").bind(k, Date.now()).run();
    marked.set(k, Date.now());
  } catch { /* sayaç hatası paneli bozmasın */ }
}

const HITS = new Map<string, number>();
export async function recordHit(req: Request, db: DB) {
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const ua = req.headers.get("User-Agent") || "";
  const m = ip + "|" + Math.floor(Date.now() / 6e4);
  const n = (HITS.get(m) || 0) + 1;
  HITS.set(m, n);
  if (HITS.size > 5000) HITS.clear();
  if (n > 120) return;
  const raw = await req.text();
  if (raw.length > 4096) return;
  let d: Record<string, unknown>;
  try { d = JSON.parse(raw); } catch { return; }
  if (!d || typeof d !== "object") return;
  await setup(db);
  const now = Date.now();
  const day = new Date(now + TR).toISOString().slice(0, 10);
  const vid = await hash(SALT + "|" + day + "|" + ip + "|" + ua);
  let x = BOT_RE.test(ua) || !req.headers.get("Accept-Language") || d.wd ? 2 : 0;
  if (!x) {
    const a = await db.prepare("SELECT t FROM admin_cihaz WHERE k = ?").bind(await deviceKey(req)).first<{ t: number }>();
    if (a && now - a.t < 30 * DAY) x = 1;
  }
  const cf = ((req as unknown as { cf?: Record<string, string> }).cf) || {};
  const p = String(d.p || "/").slice(0, 200);
  if (p.startsWith("/admin")) return;
  await db.prepare("INSERT INTO ziyaretler (t, vid, p, ti, e, src, city, dev, x) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(now, vid, p, String(d.ti || "").slice(0, 160), String(d.e || "").slice(0, 20), d.f ? srcOf(String(d.r || ""), ua, String(d.u || "")) : "", String(cf.city || cf.region || "").slice(0, 60), devOf(ua), x)
    .run();
  if (Math.random() < 0.01) await db.prepare("DELETE FROM ziyaretler WHERE t < ?").bind(now - 395 * DAY).run();
}

interface Hit { t: number; vid: string; p: string; ti: string; e: string; src: string; city: string; dev: string; x: number }
interface Sess { vid: string; start: number; end: number; src: string; city: string; dev: string; pages: { t: number; p: string; ti: string }[]; ev: string[] }

export async function stats(db: DB, days: number) {
  await setup(db);
  const now = Date.now();
  const from = now - days * DAY;
  const rows = (await db.prepare("SELECT t, vid, p, ti, e, src, city, dev, x FROM ziyaretler WHERE t > ? ORDER BY t LIMIT 60000").bind(from).all<Hit>()).results;
  const real = rows.filter((r) => !r.x);
  const skipped = { admin: rows.filter((r) => r.x === 1 && !r.e).length, bot: rows.filter((r) => r.x === 2).length };
  const views = real.filter((r) => !r.e);
  const ev = real.filter((r) => r.e);
  // ziyaret = aynı ziyaretçinin 30 dakikadan kısa aralıklı sayfaları
  const sess: Sess[] = [];
  const last: Record<string, Sess> = {};
  for (const r of views) {
    let s = last[r.vid];
    if (!s || r.t - s.end > 30 * 6e4) {
      s = { vid: r.vid, start: r.t, end: r.t, src: r.src || "", city: r.city, dev: r.dev, pages: [], ev: [] };
      sess.push(s);
      last[r.vid] = s;
    }
    s.end = r.t;
    s.pages.push({ t: r.t, p: r.p, ti: r.ti });
    if (!s.src && r.src) s.src = r.src;
  }
  for (const s of sess) if (!s.src) s.src = "Doğrudan";
  for (const r of ev) last[r.vid]?.ev.push(r.e);
  const top = <T>(arr: T[], k: (a: T) => string, n = 10) => {
    const m: Record<string, number> = {};
    for (const a of arr) { const v = k(a); if (v) m[v] = (m[v] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const dayKey = (t: number) => new Date(t + TR).toISOString().slice(0, 10);
  const daily: Record<string, Set<string>> = {};
  for (const s of sess) (daily[dayKey(s.start)] ||= new Set()).add(s.vid);
  const title: Record<string, string> = {};
  for (const v of views) title[v.p] = v.ti || title[v.p];
  const today = dayKey(now);
  const multi = sess.filter((s) => s.pages.length > 1).length;
  return {
    days,
    visitors: new Set(views.map((v) => v.vid)).size,
    visits: sess.length,
    views: views.length,
    today: daily[today]?.size || 0,
    formStarts: views.filter((v) => v.p.startsWith("/talep-olustur")).length,
    talep: ev.filter((e) => e.e === "talep").length,
    bounce: sess.length ? Math.round(((sess.length - multi) / sess.length) * 100) : 0,
    daily: Object.fromEntries(Object.entries(daily).map(([k, v]) => [k, v.size])),
    pages: top(views, (v) => v.p).map(([p, n]) => [p, (title[p] || p).replace(/\s*[|–-]\s*Brif.*$/, ""), n] as [string, string, number]),
    sources: top(sess, (s) => s.src),
    cities: top(sess, (s) => s.city || "Bilinmiyor"),
    devices: top(sess, (s) => s.dev),
    recent: sess.slice(-50).reverse(),
    skipped,
  };
}
