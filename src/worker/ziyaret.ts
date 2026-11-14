// Ziyaretçi sayacı ve rapor (çerezsiz; IP saklanmaz). parcamnerde'deki sistemin Brif uyarlaması.
// Ziyaretçi kimliği: gizli tuz + gün + IP + tarayıcı özetinin kısa hash'i (gün değişince sıfırlanır).
// Her sayfa görüntülemesi bir satır (pv = sayfa kimliği); sayfadan çıkarken aktif süre (d, sn) ve kaydırma (sc, %) güncellenir.
// Olaylar (e): tik (buton/link tıklaması), form-basla, form-adim, talep, butce-dusuk. ex = ayrıntı (hizmet, buton yazısı).
// Admin'e giriş yapan cihaz 30 gün boyunca sayıma katılmaz; botlar ve veri merkezi trafiği ayrı işaretlenir (x=2).

interface D1Stmt { bind(...v: unknown[]): D1Stmt; first<T = any>(): Promise<T | null>; all<T = any>(): Promise<{ results: T[] }>; run(): Promise<unknown> }
interface DB { prepare(q: string): D1Stmt }

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|mediapartners|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|python|curl|wget|httpclient|okhttp|axios|node-fetch|go-http|java\/|facebookexternalhit|whatsapp\/|telegrambot|preview|monitor|uptime|scan|check|validator|feedfetcher|ahrefs|semrush|mj12|dotbot|petal|yandex(?!browser)|baidu|bytespider|gptbot|claude|anthropic|perplexity|ccbot|amazonbot|applebot/i;
// Veri merkezi / bulut ağları (gerçek kullanıcı değil). iCloud Özel Geçiş (Akamai, Cloudflare, Fastly) kasıtlı olarak yok.
const DC_RE = /amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|ovh|hetzner|linode|oracle|alibaba|tencent|contabo|vultr|choopa|leaseweb|m247|datacamp|cdn77|scaleway|hostinger|ionos|psychz|quadranet|colocrossing|servers\.com|zenlayer|g-core|gcore|kamatera|hostwinds|interserver|netcup|serverion|tzulo|clouvider|packethub|hostroyale/i;
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
  const M: [RegExp, string][] = [[/google\./, "Google"], [/bing\.com/, "Bing"], [/yandex\./, "Yandex"], [/duckduckgo/, "DuckDuckGo"], [/instagram/, "Instagram"], [/facebook|fb\.com|fb\.me/, "Facebook"], [/linkedin/, "LinkedIn"], [/^t\.co$|twitter|x\.com/, "X"], [/whatsapp|wa\.me/, "WhatsApp"], [/tiktok/, "TikTok"], [/youtube/, "YouTube"], [/chatgpt|openai/, "ChatGPT"], [/perplexity/, "Perplexity"], [/claude\.ai/, "Claude"], [/gemini\.google/, "Gemini"]];
  for (const [r, n] of M) if (r.test(host)) return n;
  return host.slice(0, 40);
}

let ready = false;
let SALT = "";
async function setup(db: DB) {
  if (ready) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS ziyaretler (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, vid TEXT NOT NULL, p TEXT NOT NULL, ti TEXT NOT NULL DEFAULT '', e TEXT NOT NULL DEFAULT '', src TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', dev TEXT NOT NULL DEFAULT '', x INTEGER NOT NULL DEFAULT 0)").run();
  const cols = new Set((await db.prepare("PRAGMA table_info(ziyaretler)").all<{ name: string }>()).results.map((c) => c.name));
  const add: [string, string][] = [["pv", "TEXT NOT NULL DEFAULT ''"], ["d", "INTEGER NOT NULL DEFAULT 0"], ["sc", "INTEGER NOT NULL DEFAULT 0"], ["ex", "TEXT NOT NULL DEFAULT ''"], ["il", "TEXT NOT NULL DEFAULT ''"], ["ulke", "TEXT NOT NULL DEFAULT ''"]];
  for (const [c, def] of add) if (!cols.has(c)) { try { await db.prepare(`ALTER TABLE ziyaretler ADD COLUMN ${c} ${def}`).run(); } catch { /* aynı anda eklenmiş olabilir */ } }
  await db.prepare("CREATE INDEX IF NOT EXISTS ziyaretler_t ON ziyaretler (t)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS ziyaretler_pv ON ziyaretler (pv)").run();
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

const OLAY = new Set(["tik", "form-basla", "form-adim", "talep", "butce-dusuk"]);
const HITS = new Map<string, number>();
const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);

export async function recordHit(req: Request, db: DB) {
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const ua = req.headers.get("User-Agent") || "";
  const m = ip + "|" + Math.floor(Date.now() / 6e4);
  const n = (HITS.get(m) || 0) + 1;
  HITS.set(m, n);
  if (HITS.size > 5000) HITS.clear();
  if (n > 150) return;
  const raw = await req.text();
  if (raw.length > 4096) return;
  let d: Record<string, unknown>;
  try { d = JSON.parse(raw); } catch { return; }
  if (!d || typeof d !== "object") return;
  await setup(db);
  const now = Date.now();
  const day = new Date(now + TR).toISOString().slice(0, 10);
  const vid = await hash(SALT + "|" + day + "|" + ip + "|" + ua);
  const pv = s(d.pv, 16).replace(/[^a-z0-9]/gi, "");
  const p = s(d.p || "/", 200);
  if (p.startsWith("/admin")) return;

  // Sayfadan çıkış: süre ve kaydırma güncellenir (yalnızca aynı ziyaretçinin kendi satırı)
  if (d.e === "sure") {
    if (!pv) return;
    const sec = Math.max(0, Math.min(3600, Math.round(Number(d.d) || 0)));
    const sc = Math.max(0, Math.min(100, Math.round(Number(d.sc) || 0)));
    await db.prepare("UPDATE ziyaretler SET d = MAX(d, ?), sc = MAX(sc, ?) WHERE pv = ? AND e = '' AND t > ?").bind(sec, sc, pv, now - 2 * 36e5).run();
    return;
  }
  const e = OLAY.has(String(d.e)) ? String(d.e) : "";
  if (d.e && !e) return;

  const cf = ((req as unknown as { cf?: Record<string, string> }).cf) || {};
  let x = BOT_RE.test(ua) || !req.headers.get("Accept-Language") || d.wd || DC_RE.test(String(cf.asOrganization || "")) ? 2 : 0;
  if (!x) {
    const a = await db.prepare("SELECT t FROM admin_cihaz WHERE k = ?").bind(await deviceKey(req)).first<{ t: number }>();
    if (a && now - a.t < 30 * DAY) x = 1;
  }
  await db.prepare("INSERT INTO ziyaretler (t, vid, p, ti, e, src, city, dev, x, pv, ex, il, ulke) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(now, vid, p, s(d.ti, 160), e, !e && d.f ? srcOf(s(d.r, 400), ua, s(d.u, 40)) : "", s(cf.city, 60), devOf(ua), x, e ? "" : pv, s(d.ex, 120), s(cf.region, 60), s(cf.country, 2))
    .run();
  if (Math.random() < 0.01) await db.prepare("DELETE FROM ziyaretler WHERE t < ?").bind(now - 395 * DAY).run();
}

// ------------------------------------------------------------------ rapor
interface Hit { id: number; t: number; vid: string; p: string; ti: string; e: string; src: string; city: string; dev: string; x: number; d: number; sc: number; ex: string; il: string; ulke: string }
export interface Adim { t: number; p: string; ti: string; d: number; sc: number; e?: string; ex?: string }
export interface Oturum { vid: string; start: number; end: number; src: string; city: string; il: string; ulke: string; dev: string; pages: Adim[]; ev: Adim[]; sure: number; alan: string; sonuc: "talep" | "form" | "" }

/** Sayfa adresinden ilgi alanı */
export function alanOf(p: string) {
  if (p === "/" || /^\/hizmetler\/(urun|etkinlik|dugun|tanitim|reels|video)/.test(p)) return "Fotoğraf & video";
  if (p.startsWith("/tasarim") || p.startsWith("/hizmetler/grafik")) return "Tasarım";
  if (p.startsWith("/dijital") || /^\/hizmetler\/(sosyal|meta)/.test(p)) return "Dijital";
  if (p.startsWith("/talep-olustur")) return "Talep formu";
  if (p.startsWith("/fiyat-rehberi")) return "Fiyatlar";
  if (p.startsWith("/blog")) return "Blog";
  return "";
}
const cleanTitle = (t: string) => t.replace(/\s*[|–-]\s*Brif.*$/, "").trim();
export const olayAd = (e: string, ex: string) =>
  e === "talep" ? `Talep gönderdi${ex ? " · " + ex : ""}` : e === "form-basla" ? `Formu doldurmaya başladı${ex ? " · " + ex : ""}` : e === "form-adim" ? `Form adımı ${ex}` : e === "butce-dusuk" ? `Bütçe rehberin altında${ex ? " · " + ex : ""}` : e === "tik" ? `Tıkladı: ${ex}` : e;

function oturumlar(rows: Hit[]) {
  const views = rows.filter((r) => !r.e);
  const ev = rows.filter((r) => r.e);
  const sess: Oturum[] = [];
  const last: Record<string, Oturum> = {};
  for (const r of views) {
    let o = last[r.vid];
    if (!o || r.t - o.end > 30 * 6e4) {
      o = { vid: r.vid, start: r.t, end: r.t, src: r.src || "", city: r.city, il: r.il, ulke: r.ulke, dev: r.dev, pages: [], ev: [], sure: 0, alan: "", sonuc: "" };
      sess.push(o);
      last[r.vid] = o;
    }
    o.end = r.t;
    o.pages.push({ t: r.t, p: r.p, ti: cleanTitle(r.ti), d: r.d || 0, sc: r.sc || 0 });
    if (!o.src && r.src) o.src = r.src;
  }
  // olayları zamana göre ilgili oturuma ekle
  const byVid: Record<string, Oturum[]> = {};
  for (const o of sess) (byVid[o.vid] ||= []).push(o);
  for (const r of ev) {
    const list = byVid[r.vid];
    if (!list) continue;
    const o = list.find((x) => r.t >= x.start - 6e4 && r.t <= x.end + 31 * 6e4) || list[list.length - 1];
    o.ev.push({ t: r.t, p: r.p, ti: "", d: 0, sc: 0, e: r.e, ex: r.ex });
  }
  for (const o of sess) {
    if (!o.src) o.src = "Doğrudan";
    const aktif = o.pages.reduce((a, b) => a + b.d, 0);
    o.sure = Math.max(aktif, Math.round((o.end - o.start) / 1000));
    const al: Record<string, number> = {};
    for (const pg of o.pages) { const a = alanOf(pg.p); if (a && a !== "Talep formu") al[a] = (al[a] || 0) + 1 + pg.d / 30; }
    o.alan = Object.entries(al).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    o.sonuc = o.ev.some((e) => e.e === "talep") ? "talep" : o.ev.some((e) => e.e === "form-basla") || o.pages.some((p) => p.p.startsWith("/talep-olustur")) ? "form" : "";
  }
  return sess;
}

async function rowsSince(db: DB, from: number, to = Date.now()) {
  return (await db.prepare("SELECT id, t, vid, p, ti, e, src, city, dev, x, d, sc, ex, il, ulke FROM ziyaretler WHERE t > ? AND t <= ? ORDER BY t LIMIT 80000").bind(from, to).all<Hit>()).results;
}

export async function stats(db: DB, days: number, opts: { tr?: boolean } = {}) {
  await setup(db);
  const now = Date.now();
  const all = await rowsSince(db, now - days * DAY);
  const skipped = { admin: all.filter((r) => r.x === 1 && !r.e).length, bot: all.filter((r) => r.x === 2 && !r.e).length, yabanci: 0 };
  let real = all.filter((r) => !r.x);
  if (opts.tr) { const before = real.filter((r) => !r.e).length; real = real.filter((r) => !r.ulke || r.ulke === "TR"); skipped.yabanci = before - real.filter((r) => !r.e).length; }
  const views = real.filter((r) => !r.e);
  const ev = real.filter((r) => r.e);
  const sess = oturumlar(real);
  const top = <T>(arr: T[], k: (a: T) => string, n = 10) => {
    const m: Record<string, number> = {};
    for (const a of arr) { const v = k(a); if (v) m[v] = (m[v] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const dayKey = (t: number) => new Date(t + TR).toISOString().slice(0, 10);
  const daily: Record<string, Set<string>> = {};
  for (const o of sess) (daily[dayKey(o.start)] ||= new Set()).add(o.vid);
  // sayfa başına görüntüleme + ortalama süre
  const pg: Record<string, { n: number; d: number; dn: number; ti: string }> = {};
  for (const v of views) {
    const k = (pg[v.p] ||= { n: 0, d: 0, dn: 0, ti: "" });
    k.n++;
    if (v.d > 0) { k.d += v.d; k.dn++; }
    if (v.ti) k.ti = cleanTitle(v.ti);
  }
  const pages = Object.entries(pg).sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([p, v]) => ({ p, ti: v.ti || p, n: v.n, ort: v.dn ? Math.round(v.d / v.dn) : 0 }));
  const sureler = sess.map((o) => o.sure).filter((x) => x > 0);
  const tiklar = top(ev.filter((e) => e.e === "tik"), (e) => e.ex, 10);
  const formHizmet = top(ev.filter((e) => e.e === "form-basla" && e.ex), (e) => e.ex, 10);
  const adimlar = ev.filter((e) => e.e === "form-adim");
  const huni = {
    ziyaret: sess.length,
    form: sess.filter((o) => o.sonuc !== "").length,
    basla: new Set(ev.filter((e) => e.e === "form-basla").map((e) => e.vid)).size,
    adim3: new Set(adimlar.filter((e) => Number(e.ex) >= 3).map((e) => e.vid)).size,
    talep: new Set(ev.filter((e) => e.e === "talep").map((e) => e.vid)).size,
  };
  const multi = sess.filter((o) => o.pages.length > 1).length;
  return {
    days,
    visitors: new Set(views.map((v) => v.vid)).size,
    visits: sess.length,
    views: views.length,
    today: daily[dayKey(now)]?.size || 0,
    ortSure: sureler.length ? Math.round(sureler.reduce((a, b) => a + b, 0) / sureler.length) : 0,
    bounce: sess.length ? Math.round(((sess.length - multi) / sess.length) * 100) : 0,
    daily: Object.fromEntries(Object.entries(daily).map(([k, v]) => [k, v.size])),
    pages,
    sources: top(sess, (o) => o.src),
    iller: top(sess.filter((o) => !o.ulke || o.ulke === "TR"), (o) => o.il || o.city || "Bilinmiyor"),
    ulkeler: top(sess, (o) => o.ulke || "?"),
    devices: top(sess, (o) => o.dev),
    alanlar: top(sess, (o) => o.alan || "Belirsiz"),
    tiklar,
    formHizmet,
    huni,
    recent: sess.slice(-60).reverse(),
    skipped,
  };
}

/** Tek ziyaretin ayrıntısı: o ziyaretçinin o günkü tüm satırları içinden başlangıç zamanına göre oturum */
export async function oturumDetay(db: DB, vid: string, start: number) {
  await setup(db);
  const rows = (await db.prepare("SELECT id, t, vid, p, ti, e, src, city, dev, x, d, sc, ex, il, ulke FROM ziyaretler WHERE vid = ? AND t > ? AND t < ? ORDER BY t LIMIT 2000").bind(vid, start - DAY, start + DAY).all<Hit>()).results;
  const list = oturumlar(rows);
  const o = list.find((x) => x.start === start) || list.find((x) => start >= x.start && start <= x.end) || null;
  return { o, digerleri: list.filter((x) => x !== o) };
}
