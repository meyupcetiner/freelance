// Brif — Cloudflare Worker: talep API'si (D1'e kayıt) + yönetim paneli.
// Statik sayfalar ASSETS üzerinden sunulur; yayınlanmış bir görsel tasarımı olan sayfalara Worker tasarımı uygular.
import { recordHit, markAdmin, stats as ziyaretStats, oturumDetay, olayAd, alanOf, type Oturum } from "./ziyaret";
import { CATEGORIES, STATUSES, TIMINGS, PREFS, SERVICES, categoryBySlug } from "../data/catalog";
import { answerRows, clean, FILE_RULES, validateTalep } from "../lib/talep";
import type { Pricing } from "../lib/pricing";
import { PROFILE_ART } from "../data/profiles";
import BLOG_SEED from "../../scripts/blog-posts.json";
import { applyDesign, isEmptyDesign, pageKey, sanitizeDesign, type Design } from "../lib/tasarim";

declare const __PRICING__: Record<string, Pricing>;
declare const __BUILD__: string;

interface D1Result<T = any> { results: T[]; meta: { last_row_id: number; changes: number } }
interface D1Stmt { bind(...v: unknown[]): D1Stmt; run(): Promise<D1Result>; first<T = any>(): Promise<T | null>; all<T = any>(): Promise<D1Result<T>> }
interface D1 { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<D1Result[]> }
interface Env { DB: D1; ASSETS: { fetch(r: Request): Promise<Response> }; ADMIN_PASSWORD?: string }

const enc = new TextEncoder();
const now = () => new Date().toISOString();

// ------------------------------------------------------------------ yardımcılar
const h = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
async function sha(s: string) {
  return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 22);
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const SEC_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Cache-Control": "no-store",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SEC_HEADERS } });
}
function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; form-action 'self'",
      ...SEC_HEADERS,
    },
  });
}
const redirect = (to: string, extra: Record<string, string> = {}) => new Response(null, { status: 303, headers: { Location: to, ...extra } });
const sameOrigin = (req: Request, url: URL) => (req.headers.get("Origin") || "") === url.origin;
const clientIp = (req: Request) => req.headers.get("CF-Connecting-IP") || "0.0.0.0";

async function rateLimit(env: Env, key: string, max: number, windowSec: number) {
  const t = Math.floor(Date.now() / 1000);
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM istek_sinir WHERE k = ? AND ts > ?").bind(key, t - windowSec).first<{ n: number }>();
  if ((r?.n ?? 0) >= max) return false;
  await env.DB.prepare("INSERT INTO istek_sinir (k, ts) VALUES (?, ?)").bind(key, t).run();
  return true;
}

function newRef() {
  const d = new Date();
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY3479";
  const rnd = crypto.getRandomValues(new Uint8Array(5));
  return `T-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}-${[...rnd].map((b) => alphabet[b % alphabet.length]).join("")}`;
}

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}

// ------------------------------------------------------------------ talep API
async function createTalep(req: Request, env: Env, url: URL): Promise<Response> {
  if (!sameOrigin(req, url)) return json({ error: "İstek kaynağı doğrulanamadı." }, 403);
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > 6_000_000) return json({ error: "Gönderim çok büyük. Dosyaları küçültüp tekrar dene." }, 413);

  let body: any;
  const files: File[] = [];
  const ct = req.headers.get("Content-Type") || "";
  try {
    if (ct.startsWith("multipart/form-data")) {
      const fd = await req.formData();
      body = JSON.parse(String(fd.get("veri") || "{}"));
      for (const f of fd.getAll("dosya")) if (typeof f !== "string") files.push(f as File);
    } else if (ct.startsWith("application/json")) {
      body = await req.json();
    } else return json({ error: "Geçersiz istek." }, 415);
  } catch {
    return json({ error: "İstek okunamadı." }, 400);
  }

  // Bot işaretleri: sessizce başarılı görün
  if (clean(body?.website, 200) || Number(body?.elapsed) < 4000) return json({ ok: true, ref: "T-0000-00000" }, 201);

  const ipKey = await sha("ip:" + clientIp(req) + (env.ADMIN_PASSWORD || ""));
  if (!(await rateLimit(env, "talep:" + ipKey, 10, 3600))) return json({ error: "Kısa sürede çok fazla talep gönderildi. Bir süre sonra tekrar dene." }, 429);

  const v = validateTalep(body, (ref) => __PRICING__[ref] ?? null);
  if (!v.ok) return json({ error: v.message, fields: v.fields }, 422);
  const k = v.kayit;

  // Aynı talebin iki kez gönderilmesini engelle
  const ex = await env.DB.prepare("SELECT ref FROM talepler WHERE idem = ?").bind(k.idem).first<{ ref: string }>();
  if (ex) return json({ ok: true, ref: ex.ref, tekrar: true }, 200);

  if (files.length > FILE_RULES.maxFiles) return json({ error: `En fazla ${FILE_RULES.maxFiles} dosya ekleyebilirsin.`, fields: { dosya: "Dosya sayısı fazla." } }, 422);
  const ready: { ad: string; tur: string; veri: Uint8Array }[] = [];
  for (const f of files) {
    if (f.size > FILE_RULES.maxBytes) return json({ error: `"${f.name}" çok büyük (en fazla 1,5 MB).`, fields: { dosya: "Dosya çok büyük." } }, 422);
    const buf = new Uint8Array(await f.arrayBuffer());
    const tur = sniff(buf);
    if (!tur || !FILE_RULES.types.includes(tur)) return json({ error: `"${f.name}" desteklenmeyen bir dosya türü. JPG, PNG, WebP veya PDF ekle.`, fields: { dosya: "Dosya türü desteklenmiyor." } }, 422);
    ready.push({ ad: clean(f.name, 120).replace(/[^\wçğıöşüÇĞİÖŞÜ .()-]/g, "_") || "dosya", tur, veri: buf });
  }

  const ref = newRef();
  const ts = now();
  const ins = await env.DB.prepare(
    `INSERT INTO talepler (ref, idem, created_at, updated_at, kategori, kategori_ad, hizmet, hizmet_ad, cevaplar, aciklama, butce_tur, butce, rehber_min, butce_dusuk,
      zaman, zaman_tarih, ad, telefon, eposta, tercih, firma, kvkk_at, iletisim_izni, durum, kaynak, profil_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yeni', ?, NULL)`,
  )
    .bind(ref, k.idem, ts, ts, k.kategori, k.kategori_ad, k.hizmet, k.hizmet_ad, JSON.stringify(k.cevaplar), k.aciklama, k.butce_tur, k.butce, k.rehber_min, k.butce_dusuk ? 1 : 0,
      k.zaman, k.zaman_tarih, k.ad, k.telefon, k.eposta, k.tercih, k.firma, ts, k.iletisim_izni ? 1 : 0, JSON.stringify(k.kaynak))
    .run();
  const id = ins.meta.last_row_id;
  try {
    for (const f of ready) await env.DB.prepare("INSERT INTO dosyalar (talep_id, ad, tur, boyut, veri) VALUES (?, ?, ?, ?, ?)").bind(id, f.ad, f.tur, f.veri.byteLength, f.veri).run();
  } catch (e) {
    await env.DB.prepare("DELETE FROM talepler WHERE id = ?").bind(id).run();
    throw e;
  }
  // Eski hız sınırı kayıtlarını temizle
  await env.DB.prepare("DELETE FROM istek_sinir WHERE ts < ?").bind(Math.floor(Date.now() / 1000) - 86400).run();
  return json({ ok: true, ref }, 201);
}

// ------------------------------------------------------------------ oturum
const COOKIE = "brif_admin";
const SESSION_SEC = 7 * 86400;

async function isAuthed(req: Request, env: Env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)brif_admin=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEq(sig, await hmac(env.ADMIN_PASSWORD, "brif-admin:" + exp));
}
async function sessionCookie(env: Env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SEC;
  return `${COOKIE}=${exp}.${await hmac(env.ADMIN_PASSWORD!, "brif-admin:" + exp)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SEC}`;
}

// ------------------------------------------------------------------ admin görünümleri
const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }) : "—";
const tl = (n: number | null) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("tr-TR").format(n) + " ₺");
const statusOf = (k: string) => STATUSES.find((s) => s.key === k) ?? STATUSES[0];
const badge = (k: string) => `<span class="badge tone-${statusOf(k).tone}">${h(statusOf(k).label)}</span>`;
const timingLabel = (v: string) => TIMINGS.find((t) => t.value === v)?.label ?? v;
const prefLabel = (v: string) => PREFS.find((p) => p.value === v)?.label ?? v;

function layout(title: string, body: string, authed = true) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${h(title)} — Brif yönetim</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/fonts/brand.css"><link rel="stylesheet" href="/styles.css"></head>
<body class="adm">${
    authed
      ? `<div class="adm-shell"><aside class="adm-side"><div class="adm-brand"><a href="/admin">Brif</a></div>
<nav aria-label="Yönetim menüsü"><ul><li><a href="/admin/ozet">Özet</a></li><li><a href="/admin">Talepler</a></li><li><a href="/admin/ziyaretciler">Ziyaretçiler</a></li><li><a href="/admin/isler">Örnek işler</a></li><li><a href="/admin/profiller">Profiller</a></li><li><a href="/admin/blog">Blog</a></li><li><a href="/admin/duzenleyici">Görsel düzenleyici</a></li><li><a href="/admin/medya">Görseller</a></li><li><a href="/admin/talepler.csv">CSV indir</a></li><li><a href="/" target="_blank" rel="noopener">Siteyi aç</a></li></ul></nav>
<div class="adm-user"><form method="post" action="/admin/cikis"><button type="submit" class="linklike small">Çıkış yap</button></form></div></aside>
<main class="adm-main" id="icerik">${body}</main></div>`
      : `<main class="adm-login" id="icerik">${body}</main>`
  }</body></html>`;
}

function loginView(err = "", setup = false) {
  return layout(
    "Giriş",
    `<div class="login-card"><h1>Yönetim paneli</h1>${
      setup
        ? `<p class="flash err">Panel şifresi henüz tanımlanmadı. Cloudflare panelinde bu Worker için <code>ADMIN_PASSWORD</code> adında bir gizli değişken (secret) oluştur, sonra bu sayfayı yenile.</p>`
        : `${err ? `<p class="flash err" role="alert">${h(err)}</p>` : ""}
<form method="post" action="/admin/giris" class="stack"><div class="field"><label for="pw">Şifre</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>
<button class="btn btn-primary btn-block" type="submit">Giriş yap</button></form>`
    }</div>`,
    false,
  );
}

interface Row { [k: string]: any }

async function listView(env: Env, url: URL) {
  const f = {
    kategori: clean(url.searchParams.get("kategori"), 40),
    durum: clean(url.searchParams.get("durum"), 40),
    q: clean(url.searchParams.get("q"), 100),
  };
  const page = Math.max(1, Number(url.searchParams.get("sayfa")) || 1);
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.kategori) { where.push("kategori = ?"); args.push(f.kategori); }
  if (f.durum) { where.push("durum = ?"); args.push(f.durum); }
  if (f.q) {
    const like = "%" + f.q.replace(/[%_\\]/g, (c) => "\\" + c) + "%";
    where.push("(ref LIKE ? ESCAPE '\\' OR ad LIKE ? ESCAPE '\\' OR eposta LIKE ? ESCAPE '\\' OR telefon LIKE ? ESCAPE '\\' OR aciklama LIKE ? ESCAPE '\\' OR hizmet_ad LIKE ? ESCAPE '\\')");
    args.push(like, like, like, like, like, like);
  }
  const W = where.length ? " WHERE " + where.join(" AND ") : "";
  const per = 25;
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM talepler" + W).bind(...args).first<{ n: number }>())?.n ?? 0;
  const rows = (await env.DB.prepare(`SELECT id, ref, created_at, kategori_ad, hizmet_ad, butce_tur, butce, butce_dusuk, zaman, ad, durum, profil_id FROM talepler${W} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...args, per, (page - 1) * per).all<Row>()).results;
  const counts = (await env.DB.prepare("SELECT durum, COUNT(*) AS n FROM talepler GROUP BY durum").all<{ durum: string; n: number }>()).results;
  const cnt = (k: string) => counts.find((c) => c.durum === k)?.n ?? 0;
  const all = counts.reduce((s, c) => s + c.n, 0);
  const qs = (p: Record<string, string>) => "?" + new URLSearchParams(Object.entries({ ...f, ...p }).filter(([, v]) => v)).toString();
  const pages = Math.max(1, Math.ceil(total / per));
  const profs = await profilMap(env);

  return layout(
    "Talepler",
    `<div class="adm-head"><h1>Talepler <span class="muted">(${total})</span></h1></div>
<div class="kpis"><div><span class="kpi-n">${all}</span><span class="kpi-l">Toplam</span></div>${STATUSES.slice(0, 3).map((s) => `<div><span class="kpi-n">${cnt(s.key)}</span><span class="kpi-l">${h(s.label)}</span></div>`).join("")}</div>
<form class="filters" method="get" role="search">
<div class="field"><label for="f-q">Ara</label><input id="f-q" name="q" type="search" value="${h(f.q)}" placeholder="Talep no, ad, e-posta, telefon"></div>
<div class="field"><label for="f-k">Kategori</label><select id="f-k" name="kategori"><option value="">Tümü</option>${CATEGORIES.map((c) => `<option value="${c.slug}"${c.slug === f.kategori ? " selected" : ""}>${h(c.name)}</option>`).join("")}</select></div>
<div class="field"><label for="f-d">Durum</label><select id="f-d" name="durum"><option value="">Tümü</option>${STATUSES.map((s) => `<option value="${s.key}"${s.key === f.durum ? " selected" : ""}>${h(s.label)} (${cnt(s.key)})</option>`).join("")}</select></div>
<button class="btn btn-primary btn-sm" type="submit">Filtrele</button>${f.q || f.kategori || f.durum ? `<a class="text-link small" href="/admin">Temizle</a>` : ""}</form>
${
  rows.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No</th><th>Tarih</th><th>Kategori</th><th>Hizmet</th><th>Bütçe</th><th>Zaman</th><th>Ad soyad</th><th>Profil</th><th>Durum</th></tr></thead><tbody>${rows
        .map(
          (r) => `<tr><td><a class="strong" href="/admin/talep/${r.id}">${h(r.ref)}</a></td><td class="nowrap">${fmtDT(r.created_at)}</td><td>${h(r.kategori_ad)}</td><td>${h(r.hizmet_ad)}</td>
<td class="nowrap">${r.butce_tur === "teklif" ? '<span class="muted">Teklif istiyor</span>' : tl(r.butce)}${r.butce_dusuk ? ' <span class="dot-warn" title="Bütçe rehberin altında">!</span>' : ""}</td>
<td>${h(timingLabel(r.zaman))}</td><td>${h(r.ad)}</td><td class="small">${h(profs.get(r.profil_id)?.ad || "—")}</td><td>${badge(r.durum)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<div class="empty"><h2>${f.q || f.kategori || f.durum ? "Bu filtrelerle talep bulunamadı" : "Henüz talep yok"}</h2><p>${f.q || f.kategori || f.durum ? "Filtreleri değiştirmeyi dene." : "Talep formundan gelen kayıtlar burada listelenecek."}</p></div>`
}
${pages > 1 ? `<nav class="pager" aria-label="Sayfalar">${page > 1 ? `<a href="${qs({ sayfa: String(page - 1) })}">Önceki</a>` : "<span></span>"}<span>Sayfa ${page} / ${pages}</span>${page < pages ? `<a href="${qs({ sayfa: String(page + 1) })}">Sonraki</a>` : "<span></span>"}</nav>` : ""}`,
  );
}

async function detailView(env: Env, id: number, flash = "") {
  const r = await env.DB.prepare("SELECT * FROM talepler WHERE id = ?").bind(id).first<Row>();
  if (!r) return null;
  const notes = (await env.DB.prepare("SELECT metin, created_at FROM notlar WHERE talep_id = ? ORDER BY created_at DESC").bind(id).all<Row>()).results;
  const files = (await env.DB.prepare("SELECT id, ad, tur, boyut FROM dosyalar WHERE talep_id = ?").bind(id).all<Row>()).results;
  const ans = answerRows(r.hizmet, JSON.parse(r.cevaplar || "{}"));
  const src = JSON.parse(r.kaynak || "{}");
  const wa = "https://wa.me/" + String(r.telefon).replace(/\D/g, "").replace(/^0/, "90");
  const kv = (label: string, value: string) => `<div><dt>${h(label)}</dt><dd>${value}</dd></div>`;
  const profs = await profilMap(env);
  return layout(
    r.ref,
    `<p class="small"><a href="/admin">Tüm talepler</a></p>
${flash ? `<p class="flash ok" role="status">${h(flash)}</p>` : ""}
<div class="adm-head"><h1>${h(r.ref)} <span class="muted">${h(r.hizmet_ad)}</span></h1>${badge(r.durum)}</div>
<div class="grid-detail"><div class="stack">
<section class="panel"><h2 class="h-sm">Hizmet ve proje detayları</h2><dl class="kv">
${kv("Ana kategori", h(r.kategori_ad))}${kv("Alt kategori", h(r.hizmet_ad))}
${ans.map((a) => kv(a.label, h(a.value))).join("")}
${kv("Proje açıklaması", `<span class="pre">${h(r.aciklama) || "—"}</span>`)}
</dl></section>
<section class="panel"><h2 class="h-sm">Bütçe ve teslim</h2><dl class="kv">
${kv("Bütçe", r.butce_tur === "teklif" ? "Teklif istiyor" : tl(r.butce))}
${kv("Rehber alt sınır", r.rehber_min ? tl(r.rehber_min) + (r.butce_dusuk ? ' <span class="badge tone-warn">Bütçe rehberin altında</span>' : "") : "Hesaplanmadı")}
${kv("Teslim zamanı", h(timingLabel(r.zaman)) + (r.zaman_tarih ? " — " + h(r.zaman_tarih) : ""))}
</dl></section>
${files.length ? `<section class="panel"><h2 class="h-sm">Referans dosyaları</h2><ul>${files.map((f) => `<li><a href="/admin/dosya/${f.id}">${h(f.ad)}</a> <span class="muted small">${Math.max(1, Math.round(f.boyut / 1024))} KB</span></li>`).join("")}</ul></section>` : ""}
<section class="panel"><h2 class="h-sm">Notlar</h2>
${notes.length ? `<ol class="timeline">${notes.map((n) => `<li><span class="muted small">${fmtDT(n.created_at)}</span><p class="pre">${h(n.metin)}</p></li>`).join("")}</ol>` : `<p class="empty-inline">Henüz not yok.</p>`}
<form method="post" class="stack"><input type="hidden" name="action" value="not"><div class="field"><label for="n">Yönetici notu</label><textarea id="n" name="metin" rows="3" maxlength="2000" required></textarea></div><button class="btn btn-ghost btn-sm" type="submit">Not ekle</button></form>
</section></div>
<div class="stack">
<section class="panel"><h2 class="h-sm">İletişim</h2><dl class="kv">
${kv("Ad soyad", h(r.ad))}${r.firma ? kv("Firma", h(r.firma)) : ""}
${kv("Telefon", `<a href="tel:${h(String(r.telefon).replace(/\s/g, ""))}">${h(r.telefon)}</a> · <a href="${h(wa)}" target="_blank" rel="noopener">WhatsApp</a>`)}
${kv("E-posta", `<a href="mailto:${h(r.eposta)}?subject=${encodeURIComponent("Talebiniz: " + r.ref)}">${h(r.eposta)}</a>`)}
${kv("Dönüş tercihi", h(prefLabel(r.tercih)))}
${kv("İletişim izni", r.iletisim_izni ? "Kampanya/bilgilendirme iletisine izin verdi" : "Yalnızca bu talep için")}
${kv("Son iletişim", fmtDT(r.son_iletisim))}
</dl><form method="post"><input type="hidden" name="action" value="iletisim"><button class="btn btn-primary btn-sm btn-block" type="submit">Bugün iletişime geçtim</button></form></section>
<section class="panel"><h2 class="h-sm">Yanıtlayan profil</h2><form method="post" class="stack"><input type="hidden" name="action" value="profil">
<div class="field"><label for="pr">Bu talebe hangi profilden dönülecek?</label><select id="pr" name="profil_id"><option value="">Seçilmedi</option>${[...profs.values()].map((p) => `<option value="${p.id}"${p.id === r.profil_id ? " selected" : ""}>${h(p.ad)}${p.yayinda ? "" : " (gizli)"}</option>`).join("")}</select>
${profs.get(r.profil_id) ? `<p class="help">${h(profs.get(r.profil_id)!.unvan)}</p>` : ""}</div>
<button class="btn btn-ghost btn-sm" type="submit">Profili kaydet</button></form></section>
<section class="panel"><h2 class="h-sm">Durum</h2><form method="post" class="stack"><input type="hidden" name="action" value="durum">
<div class="field"><label for="d">Talep durumu</label><select id="d" name="durum">${STATUSES.map((s) => `<option value="${s.key}"${s.key === r.durum ? " selected" : ""}>${h(s.label)}</option>`).join("")}</select></div>
<button class="btn btn-ghost btn-sm" type="submit">Durumu güncelle</button></form></section>
<section class="panel"><h2 class="h-sm">Kayıt bilgisi</h2><dl class="kv small">
${kv("Oluşturulma", fmtDT(r.created_at))}${kv("Güncelleme", fmtDT(r.updated_at))}${kv("KVKK onayı", fmtDT(r.kvkk_at))}
${kv("Kaynak", h([src.source, src.medium, src.campaign].filter(Boolean).join(" / ") || src.referrer || "Doğrudan"))}${kv("İlk sayfa", h(src.landing || "—"))}
</dl></section>
<section class="panel danger"><h2 class="h-sm">Kalıcı olarak sil</h2><p class="small">Kişinin silme talebinde veya saklama süresi dolduğunda kullan. Geri alınamaz.</p>
<form method="post"><input type="hidden" name="action" value="sil"><label class="check small"><input type="checkbox" name="onay" value="1" required> Silmek istediğimi onaylıyorum</label><button class="btn btn-danger btn-sm" type="submit">Talebi sil</button></form></section>
</div></div>`,
  );
}

async function csv(env: Env) {
  const rows = (await env.DB.prepare("SELECT * FROM talepler ORDER BY created_at DESC LIMIT 5000").all<Row>()).results;
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ["Talep no", "Tarih", "Ana kategori", "Alt kategori", "Cevaplar", "Açıklama", "Bütçe", "Teslim", "Ad soyad", "Telefon", "E-posta", "Tercih", "Firma", "Durum"];
  const lines = rows.map((r) =>
    [r.ref, r.created_at, r.kategori_ad, r.hizmet_ad, answerRows(r.hizmet, JSON.parse(r.cevaplar || "{}")).map((a) => `${a.label}: ${a.value}`).join(" | "), r.aciklama,
      r.butce_tur === "teklif" ? "Teklif" : r.butce, timingLabel(r.zaman) + (r.zaman_tarih ? " " + r.zaman_tarih : ""), r.ad, r.telefon, r.eposta, prefLabel(r.tercih), r.firma, statusOf(r.durum).label]
      .map(esc)
      .join(";"),
  );
  return new Response("﻿" + [head.map(esc).join(";"), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="brif-talepler-${now().slice(0, 10)}.csv"`, ...SEC_HEADERS },
  });
}

// ------------------------------------------------------------------ uzman profilleri
async function profilMap(env: Env) {
  const rows = (await env.DB.prepare("SELECT * FROM profiller ORDER BY sira, id").all<Row>()).results;
  return new Map<number, Row>(rows.map((r) => [r.id as number, r]));
}
function profilForm(r: Row | null) {
  const v = (k: string, d = "") => h(r?.[k] ?? d);
  const al = String(r?.alanlar || "").split(",");
  return `<div class="grid-2">
<div class="field"><label for="p-ad">Profil adı</label><input id="p-ad" name="ad" required maxlength="60" value="${v("ad")}"></div>
<div class="field"><label for="p-un">Unvan / uzmanlık</label><input id="p-un" name="unvan" maxlength="90" value="${v("unvan")}"></div>
</div>
<div class="field"><label for="p-ac">Kısa tanıtım</label><textarea id="p-ac" name="aciklama" rows="3" maxlength="300">${v("aciklama")}</textarea></div>
<fieldset class="field"><legend>Alanlar (bu kategorilerden gelen talepler otomatik bu profile atanır)</legend>${CATEGORIES.map((c) => `<label class="check"><input type="checkbox" name="alanlar" value="${c.slug}"${al.includes(c.slug) ? " checked" : ""}> ${h(c.name)}</label>`).join("")}</fieldset>
<div class="grid-2">
<div class="field"><label for="p-g">Görsel</label><select id="p-g" name="gorsel">${PROFILE_ART.map((g) => `<option value="${g}"${r?.gorsel === g ? " selected" : ""}>${h(g.replace(/-/g, " "))}</option>`).join("")}</select></div>
<div class="field"><label for="p-s">Sıra</label><input id="p-s" name="sira" type="number" min="0" max="99" value="${v("sira", "0")}"></div>
</div>
<label class="check"><input type="checkbox" name="yayinda" value="1"${!r || r.yayinda ? " checked" : ""}> Sitede göster</label>`;
}
function readProfil(fd: FormData): Row | string {
  const ad = clean(fd.get("ad"), 60);
  if (!ad) return "Profil adı gerekli.";
  const gorsel = String(fd.get("gorsel") || "");
  return {
    ad,
    unvan: clean(fd.get("unvan"), 90),
    aciklama: clean(fd.get("aciklama"), 300, true),
    alanlar: fd.getAll("alanlar").map(String).filter((x) => CATEGORIES.some((c) => c.slug === x)).join(","),
    gorsel: PROFILE_ART.includes(gorsel) ? gorsel : PROFILE_ART[0],
    sira: Math.max(0, Math.min(99, Number(fd.get("sira")) || 0)),
    yayinda: fd.get("yayinda") ? 1 : 0,
  };
}
async function profillerView(env: Env, flash = "", err = "") {
  const rows = [...(await profilMap(env)).values()];
  const counts = (await env.DB.prepare("SELECT profil_id, COUNT(*) AS n FROM talepler GROUP BY profil_id").all<Row>()).results;
  const n = (id: number) => counts.find((c) => c.profil_id === id)?.n ?? 0;
  const covered = new Set(rows.filter((r) => r.yayinda).flatMap((r) => String(r.alanlar).split(",")));
  const missing = CATEGORIES.filter((c) => !covered.has(c.slug));
  return layout(
    "Profiller",
    `<div class="adm-head"><h1>Uzman profilleri <span class="muted">(${rows.length})</span></h1></div>
${flash ? `<p class="flash ok" role="status">${h(flash)}</p>` : ""}${err ? `<p class="flash err" role="alert">${h(err)}</p>` : ""}
<p class="muted">Profiller sitede görünmez. Talep detayında, talebe hangi profilden yanıt vereceğini sen seçersin.</p>
${missing.length ? `<p class="flash err">Hiçbir yayındaki profile bağlı olmayan kategori: ${missing.map((c) => h(c.name)).join(", ")}</p>` : ""}
<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Profil</th><th>Alanlar</th><th>Talep</th><th>Durum</th><th></th></tr></thead><tbody>${rows
      .map(
        (r) => `<tr><td><img src="/assets/ill/${h(r.gorsel)}.svg" alt="" width="56" height="48" style="object-fit:contain;display:block"></td>
<td><a class="strong" href="/admin/profiller/${r.id}">${h(r.ad)}</a><span class="block small muted">${h(r.unvan)}</span></td>
<td class="small">${String(r.alanlar).split(",").filter(Boolean).map((s) => h(categoryBySlug(s)?.name || s)).join(", ") || "—"}</td>
<td>${n(r.id)}</td><td>${r.yayinda ? '<span class="badge tone-ok">Sitede</span>' : '<span class="badge tone-muted">Gizli</span>'}</td><td><a class="small" href="/admin/profiller/${r.id}">Düzenle</a></td></tr>`,
      )
      .join("")}</tbody></table></div>
<form method="post" action="/admin/profiller" class="panel edit-form" style="margin-top:24px"><h2 class="h-sm">Yeni profil ekle</h2>${profilForm(null)}<div><button class="btn btn-primary btn-sm" type="submit">Ekle</button></div></form>`,
  );
}
async function profilEditView(env: Env, id: number, err = "") {
  const r = (await profilMap(env)).get(id);
  if (!r) return null;
  return layout(
    r.ad,
    `<p class="small"><a href="/admin/profiller">Tüm profiller</a></p><h1>${h(r.ad)}</h1>${err ? `<p class="flash err" role="alert">${h(err)}</p>` : ""}
<div class="grid-detail"><form method="post" class="panel edit-form">${profilForm(r)}<div><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div></form>
<div class="stack"><section class="panel"><img src="/assets/ill/${h(r.gorsel)}.svg" alt="" style="width:100%;max-height:260px;object-fit:contain"></section></div></div>`,
  );
}

// ------------------------------------------------------------------ örnek işler (portfolyo)
const IS_KATEGORI = ["Fotoğraf", "Video", "Grafik tasarım", "Web tasarım", "Sosyal medya", "Reklam", "Metin & içerik"];
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function apiIsler(env: Env) {
  const rows = (await env.DB.prepare("SELECT id, baslik, kategori, aciklama, link, updated_at FROM isler WHERE yayinda = 1 ORDER BY sira, id").all<Row>()).results;
  const isler = rows.map((r) => ({ id: r.id, baslik: r.baslik, kategori: r.kategori, aciklama: r.aciklama, link: r.link, url: `/api/isler/${r.id}?v=${encodeURIComponent(String(r.updated_at).replace(/\D/g, ""))}` }));
  return new Response(JSON.stringify({ isler }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } });
}
async function apiIsGorsel(env: Env, id: number) {
  const r = await env.DB.prepare("SELECT tur, gorsel FROM isler WHERE id = ?").bind(id).first<Row>();
  if (!r) return new Response("Bulunamadı", { status: 404 });
  const data = r.gorsel instanceof ArrayBuffer ? new Uint8Array(r.gorsel) : new Uint8Array(r.gorsel as number[]);
  return new Response(data, { headers: { "Content-Type": r.tur, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}

function isForm(r: Row | null) {
  const v = (k: string, d = "") => h(r?.[k] ?? d);
  return `<div class="grid-2">
<div class="field"><label for="i-baslik">Başlık</label><input id="i-baslik" name="baslik" required maxlength="100" value="${v("baslik")}"></div>
<div class="field"><label for="i-kat">Kategori</label><select id="i-kat" name="kategori">${IS_KATEGORI.map((k) => `<option${r?.kategori === k ? " selected" : ""}>${h(k)}</option>`).join("")}</select></div>
<div class="field"><label for="i-ac">Kısa açıklama (isteğe bağlı)</label><input id="i-ac" name="aciklama" maxlength="160" value="${v("aciklama")}"></div>
<div class="field"><label for="i-link">Bağlantı (isteğe bağlı)</label><input id="i-link" name="link" maxlength="300" placeholder="https://… veya /hizmetler/…" value="${v("link")}"></div>
<div class="field"><label for="i-sira">Sıra</label><input id="i-sira" name="sira" type="number" min="0" max="999" value="${v("sira", "0")}"></div>
<div class="field"><label for="i-gorsel">Görsel${r ? " (değiştirmek için seç)" : ""}</label><input id="i-gorsel" name="gorsel" type="file" accept="image/jpeg,image/png,image/webp"${r ? "" : " required"} data-shrink="1"><p class="help">JPG, PNG veya WebP. Büyük görseller yüklenmeden önce otomatik küçültülür (en fazla 1,5 MB).</p></div>
</div>
<label class="check"><input type="checkbox" name="yayinda" value="1"${!r || r.yayinda ? " checked" : ""}> Sitede yayınla</label>`;
}

async function islerView(env: Env, flash = "", err = "") {
  const rows = (await env.DB.prepare("SELECT id, baslik, kategori, aciklama, link, sira, yayinda, boyut, updated_at FROM isler ORDER BY sira, id").all<Row>()).results;
  return layout(
    "Örnek işler",
    `<div class="adm-head"><h1>Örnek işler <span class="muted">(${rows.length})</span></h1></div>
${flash ? `<p class="flash ok" role="status">${h(flash)}</p>` : ""}${err ? `<p class="flash err" role="alert">${h(err)}</p>` : ""}
<p class="muted">Kategoriye göre otomatik dağılır: <b>Fotoğraf, Video</b> → Stüdyo sayfası · <b>Grafik tasarım, Metin</b> → Tasarım · <b>Web tasarım, Reklam, Sosyal medya</b> → Dijital. Ana sayfadaki "Örnek işler" alanında ilk 6 iş görünür. Yalnızca paylaşma izni olan işleri ekle.</p>
${
  rows.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Görsel</th><th>Başlık</th><th>Kategori</th><th>Sıra</th><th>Durum</th><th></th></tr></thead><tbody>${rows
        .map(
          (r, i) => `<tr><td><img src="/api/isler/${r.id}?v=${h(String(r.updated_at).replace(/\D/g, ""))}" alt="" width="72" height="54" style="object-fit:cover;border-radius:8px;display:block"></td>
<td><a class="strong" href="/admin/isler/${r.id}">${h(r.baslik)}</a>${r.aciklama ? `<span class="block small muted">${h(r.aciklama)}</span>` : ""}</td><td>${h(r.kategori)}</td><td>${r.sira}</td>
<td>${r.yayinda ? (i < 6 ? '<span class="badge tone-ok">Ana sayfada</span>' : '<span class="badge tone-neutral">Yayında (7+)</span>') : '<span class="badge tone-muted">Gizli</span>'}</td>
<td><a class="small" href="/admin/isler/${r.id}">Düzenle</a></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<div class="empty"><h2>Henüz iş eklenmedi</h2><p>İlk gerçek işini aşağıdan ekle. Eklenen her iş, ana sayfadaki temsili kutulardan birinin yerini alır.</p></div>`
}
<form method="post" action="/admin/isler" enctype="multipart/form-data" class="panel edit-form" style="margin-top:24px"><h2 class="h-sm">Yeni iş ekle</h2>${isForm(null)}<div><button class="btn btn-primary btn-sm" type="submit">Ekle</button></div></form>
<script src="/admin/gorsel.js" type="module"></script>`,
  );
}

async function isEditView(env: Env, id: number, err = "") {
  const r = await env.DB.prepare("SELECT id, baslik, kategori, aciklama, link, sira, yayinda, updated_at FROM isler WHERE id = ?").bind(id).first<Row>();
  if (!r) return null;
  return layout(
    r.baslik,
    `<p class="small"><a href="/admin/isler">Tüm işler</a></p><h1>${h(r.baslik)}</h1>${err ? `<p class="flash err" role="alert">${h(err)}</p>` : ""}
<div class="grid-detail"><form method="post" enctype="multipart/form-data" class="panel edit-form"><input type="hidden" name="action" value="guncelle">${isForm(r)}<div><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div></form>
<div class="stack"><section class="panel"><img src="/api/isler/${r.id}?v=${h(String(r.updated_at).replace(/\D/g, ""))}" alt="${h(r.baslik)}" style="width:100%;border-radius:12px"></section>
<section class="panel danger"><h2 class="h-sm">İşi sil</h2><form method="post"><input type="hidden" name="action" value="sil"><label class="check small"><input type="checkbox" name="onay" value="1" required> Silmek istediğimi onaylıyorum</label><button class="btn btn-danger btn-sm" type="submit">Sil</button></form></section></div></div>
<script src="/admin/gorsel.js" type="module"></script>`,
  );
}

async function readIsForm(fd: FormData, requireImage: boolean): Promise<{ ok: true; d: Row } | { ok: false; err: string }> {
  const baslik = clean(fd.get("baslik"), 100);
  const kategori = String(fd.get("kategori") || "");
  const link = clean(fd.get("link"), 300);
  if (!baslik) return { ok: false, err: "Başlık gerekli." };
  if (!IS_KATEGORI.includes(kategori)) return { ok: false, err: "Geçerli bir kategori seç." };
  if (link && !/^(https:\/\/|\/(?!\/))/.test(link)) return { ok: false, err: "Bağlantı https:// veya / ile başlamalı." };
  const d: Row = { baslik, kategori, link, aciklama: clean(fd.get("aciklama"), 160), sira: Math.max(0, Math.min(999, Number(fd.get("sira")) || 0)), yayinda: fd.get("yayinda") ? 1 : 0 };
  const f = fd.get("gorsel");
  if (f && typeof f !== "string" && (f as File).size > 0) {
    const file = f as File;
    if (file.size > FILE_RULES.maxBytes) return { ok: false, err: "Görsel en fazla 1,5 MB olabilir." };
    const buf = new Uint8Array(await file.arrayBuffer());
    const tur = sniff(buf);
    if (!tur || !IMG_TYPES.includes(tur)) return { ok: false, err: "Yalnızca JPG, PNG veya WebP görsel yükleyebilirsin." };
    d.tur = tur;
    d.gorsel = buf;
  } else if (requireImage) return { ok: false, err: "Bir görsel seç." };
  return { ok: true, d };
}

// Görselleri yüklemeden önce tarayıcıda küçülten küçük betik (yalnızca admin)
const GORSEL_JS = `for (const inp of document.querySelectorAll('input[data-shrink]')) {
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if (!f || f.size <= 1400000) return;
    const bmp = await createImageBitmap(f);
    let max = 2000;
    for (let i = 0; i < 6; i++) {
      const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise((r) => c.toBlob(r, 'image/webp', 0.84));
      if (b && b.size <= 1400000) {
        const dt = new DataTransfer();
        dt.items.add(new File([b], f.name.replace(/\\.\\w+$/, '') + '.webp', { type: 'image/webp' }));
        inp.files = dt.files;
        return;
      }
      max = Math.round(max * 0.8);
    }
  });
}`;

// ------------------------------------------------------------------ blog
const INDEXNOW_KEY = "5880f9bc5bf5099b5f0e4be3cb50cf17";
const HUB_KAT: Record<string, { ad: string; kategori: string }> = {
  studyo: { ad: "Brif Stüdyo", kategori: "fotograf-video" },
  tasarim: { ad: "Brif Tasarım", kategori: "grafik-tasarim" },
  dijital: { ad: "Brif Dijital", kategori: "web-yazilim" },
};
const slugify = (t: string) =>
  t.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const trDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
};

/** Güvenli markdown alt kümesi → HTML (önce her şey kaçışlanır) */
function mdHtml(src: string): string {
  const inline = (t: string) =>
    h(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, txt: string, url: string) => {
        const u = url.replace(/&amp;/g, "&");
        if (!/^(https?:\/\/|\/(?!\/)|mailto:|tel:|#)/i.test(u)) return txt;
        const ext = /^https?:/i.test(u);
        return `<a href="${h(u)}"${ext ? ' rel="noopener" target="_blank"' : ""}>${txt}</a>`;
      });
  const lines = src.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^(#{2,3})\s+(.*)$/))) { const n = m[1].length; out.push(`<h${n} id="${slugify(m[2])}">${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ""))}</li>`);
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i++].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
        rows.push(cells);
      }
      if (rows.length) out.push(`<div class="tbl-scroll"><table><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|\s*[-*]\s|\s*\d+[.)]\s|\|)/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

/** İlk yazılar: tablo boşsa bir kez eklenir (silinirse geri gelmez) */
let blogSeeded = false;
async function ensureBlogSeed(env: Env) {
  if (blogSeeded) return;
  blogSeeded = true;
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS kurulum (anahtar TEXT PRIMARY KEY, created_at TEXT NOT NULL)").run();
    const done = await env.DB.prepare("SELECT anahtar FROM kurulum WHERE anahtar = 'blog-v1'").first<Row>();
    if (done) return;
    const days = [0, -2, -4, -6, -8];
    for (const [i, p] of (BLOG_SEED as Row[]).entries()) {
      const d = new Date(Date.UTC(2026, 10, 7 + (days[i] ?? -10), 6)).toISOString();
      await env.DB.prepare("INSERT OR IGNORE INTO bloglar (slug, baslik, ozet, icerik, kapak, kapak_alt, hub, ilgili, durum, yayin_tarihi, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(p.slug, p.baslik, p.ozet, p.icerik, p.kapak, p.kapak_alt, p.hub, p.ilgili, "yayinda", d, d, d).run();
    }
    await env.DB.prepare("INSERT OR IGNORE INTO kurulum (anahtar, created_at) VALUES ('blog-v1', ?)").bind(now()).run();
  } catch {
    blogSeeded = false;
  }
}

async function blogShell(env: Env, url: URL) {
  const r = await env.ASSETS.fetch(new Request(new URL("/blog-sablon", url).toString()));
  return r.ok ? r.text() : null;
}
function fillShell(shell: string, o: { title: string; desc: string; path: string; main: string; ld: object[]; image?: string; site: string }) {
  let out = shell
    .split("__BLOG_TITLE__").join(h(o.title))
    .split("__BLOG_DESC__").join(h(o.desc))
    .split("/__BLOG_PATH__").join(o.path)
    .replace(/<meta name="robots" content="noindex, follow"\/>/, "")
    .replace("<!--BLOG_MAIN-->", o.main);
  if (o.image) out = out.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${h(o.site + o.image)}$2`);
  const ld = o.ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("");
  return out.replace("</head>", ld + "</head>");
}
const crumbs = (items: [string, string][]) =>
  `<nav aria-label="Konum" class="crumbs"><ol>${items.map(([n, p], i) => (i < items.length - 1 ? `<li><a href="${p}">${h(n)}</a></li>` : `<li><span aria-current="page">${h(n)}</span></li>`)).join("")}</ol></nav>`;

async function blogPage(env: Env, url: URL, slug: string | null): Promise<Response | null> {
  await ensureBlogSeed(env);
  const shell = await blogShell(env, url);
  if (!shell) return null;
  const site = url.origin;
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" };
  if (!slug) {
    const rows = (await env.DB.prepare("SELECT slug, baslik, ozet, kapak, kapak_alt, yayin_tarihi FROM bloglar WHERE durum = 'yayinda' AND yayin_tarihi <= ? ORDER BY yayin_tarihi DESC LIMIT 100").bind(now()).all<Row>()).results;
    const main = `<section class="page-head"><div class="wrap">${crumbs([["Ana sayfa", "/"], ["Blog", "/blog"]])}<h1>Blog</h1><p class="lead">Fotoğraf, tasarım ve dijital pazarlama projelerine başlamadan önce bilmen gerekenler.</p></div></section>
<section class="section section-tight"><div class="wrap">${
      rows.length
        ? `<ul class="blog-list">${rows.map((r) => `<li class="blog-card"><a href="/blog/${h(r.slug)}">${r.kapak ? `<span class="bc-img"><img src="${h(r.kapak)}" alt="${h(r.kapak_alt)}" loading="lazy" decoding="async"></span>` : ""}<span class="bc-body"><span class="bc-date">${trDate(String(r.yayin_tarihi))}</span><h2>${h(r.baslik)}</h2><p>${h(r.ozet)}</p></span></a></li>`).join("")}</ul>`
        : `<p class="muted">Yakında.</p>`
    }</div></section>`;
    const ld = [
      { "@context": "https://schema.org", "@type": "Blog", name: "Brif Blog", url: site + "/blog" },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Ana sayfa", item: site + "/" }, { "@type": "ListItem", position: 2, name: "Blog", item: site + "/blog" }] },
    ];
    return new Response(fillShell(shell, { title: "Blog: fotoğraf, tasarım ve dijital pazarlama rehberleri", desc: "Ürün fotoğrafı, tanıtım filmi, kurumsal kimlik ve reklam yönetimi projelerinde fiyat, süreç ve hazırlık rehberleri.", path: "/blog", main, ld, site }), { headers });
  }
  const r = await env.DB.prepare("SELECT * FROM bloglar WHERE slug = ? AND durum = 'yayinda' AND yayin_tarihi <= ?").bind(slug, now()).first<Row>();
  if (!r) return null;
  const words = String(r.icerik).split(/\s+/).length;
  const hub = HUB_KAT[String(r.hub)] || HUB_KAT.studyo;
  const rel = String(r.ilgili || "")
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter(([t, u]) => t && u && /^\/(?!\/)/.test(u));
  const path = `/blog/${r.slug}`;
  const main = `<article class="post"><div class="wrap narrow">
<header class="post-head">${crumbs([["Ana sayfa", "/"], ["Blog", "/blog"], [String(r.baslik), path]])}<h1>${h(r.baslik)}</h1>
<p class="post-meta">${hub.ad} · <time datetime="${h(String(r.yayin_tarihi).slice(0, 10))}">${trDate(String(r.yayin_tarihi))}</time> · ${Math.max(1, Math.round(words / 200))} dk okuma</p></header>
${r.kapak ? `<figure class="post-cover"><img src="${h(r.kapak)}" alt="${h(r.kapak_alt)}" decoding="async"></figure>` : ""}
<div class="post-body">${mdHtml(String(r.icerik))}</div>
${rel.length ? `<aside class="post-rel"><strong>İlgili sayfalar</strong><ul>${rel.map(([t, u]) => `<li><a href="${h(u)}">${h(t)}</a></li>`).join("")}</ul></aside>` : ""}
<div class="post-cta"><p>Projen için kapsamı yaz, yazılı teklif al.</p><a class="btn btn-signal" href="/talep-olustur?kategori=${hub.kategori}">Talep oluştur</a></div>
</div></article>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "BlogPosting", headline: r.baslik, description: r.ozet, datePublished: r.yayin_tarihi, dateModified: r.updated_at, mainEntityOfPage: site + path, ...(r.kapak ? { image: site + r.kapak } : {}), author: { "@type": "Organization", name: "Brif" }, publisher: { "@type": "Organization", name: "Brif", url: site + "/" } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Ana sayfa", item: site + "/" }, { "@type": "ListItem", position: 2, name: "Blog", item: site + "/blog" }, { "@type": "ListItem", position: 3, name: r.baslik, item: site + path }] },
  ];
  return new Response(fillShell(shell, { title: String(r.baslik), desc: String(r.ozet), path, main, ld, image: r.kapak ? String(r.kapak) : undefined, site }), { headers });
}

async function sitemapXml(env: Env, url: URL) {
  await ensureBlogSeed(env);
  const r = await env.ASSETS.fetch(new Request(new URL("/sitemap.xml", url).toString()));
  let xml = r.ok ? await r.text() : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`;
  let posts: Row[] = [];
  try { posts = (await env.DB.prepare("SELECT slug, updated_at FROM bloglar WHERE durum = 'yayinda' AND yayin_tarihi <= ? ORDER BY yayin_tarihi DESC").bind(now()).all<Row>()).results; } catch {}
  const site = url.origin;
  const extra = [`  <url><loc>${site}/blog</loc></url>`, ...posts.map((p) => `  <url><loc>${site}/blog/${h(p.slug)}</loc><lastmod>${String(p.updated_at).slice(0, 10)}</lastmod></url>`)].join("\n");
  xml = xml.replace("</urlset>", extra + "\n</urlset>");
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

/** IndexNow: yeni / değişen sayfaları Bing ve Yandex'e bildirir (en iyi çaba) */
async function indexNow(url: URL, paths: string[]) {
  if (/localhost|127\.0\.0\.1/.test(url.hostname)) return;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: url.hostname, key: INDEXNOW_KEY, keyLocation: `${url.origin}/${INDEXNOW_KEY}.txt`, urlList: paths.map((p) => url.origin + p) }),
    });
  } catch {}
}

function blogForm(r: Row | null) {
  const v = (k: string, d = "") => h(r?.[k] ?? d);
  return `<div class="field"><label for="b-baslik">Başlık (aranan ifade geçsin)</label><input id="b-baslik" name="baslik" required maxlength="120" value="${v("baslik")}"></div>
<div class="grid-2"><div class="field"><label for="b-slug">Adres (boş bırakırsan başlıktan üretilir)</label><input id="b-slug" name="slug" maxlength="80" pattern="[a-z0-9-]*" value="${v("slug")}" placeholder="urun-fotografi-fiyatlari"></div>
<div class="field"><label for="b-hub">Alan</label><select id="b-hub" name="hub">${Object.entries(HUB_KAT).map(([k, x]) => `<option value="${k}"${r?.hub === k ? " selected" : ""}>${h(x.ad)}</option>`).join("")}</select></div></div>
<div class="field"><label for="b-ozet">Kısa açıklama (meta açıklama, 140–160 karakter)</label><textarea id="b-ozet" name="ozet" rows="2" maxlength="200" required>${v("ozet")}</textarea></div>
<div class="field"><label for="b-icerik">İçerik</label><textarea id="b-icerik" name="icerik" rows="22" required>${v("icerik")}</textarea><p class="help">## ara başlık, ### alt başlık, - madde, 1. sıralı madde, **kalın**, [bağlantı metni](/adres), | tablo | satırları. İlk paragrafta sorunun cevabını kalın yaz.</p></div>
<div class="grid-2"><div class="field"><label for="b-kapak">Kapak görseli adresi</label><input id="b-kapak" name="kapak" maxlength="200" value="${v("kapak")}" placeholder="/api/medya/12?v=… (Görseller sayfasından kopyala)"></div>
<div class="field"><label for="b-alt">Kapak alt metni</label><input id="b-alt" name="kapak_alt" maxlength="200" value="${v("kapak_alt")}"></div></div>
<div class="field"><label for="b-ilgili">İlgili sayfalar (her satıra: Başlık | /adres)</label><textarea id="b-ilgili" name="ilgili" rows="3">${v("ilgili")}</textarea></div>
<div class="grid-2"><div class="field"><label for="b-durum">Durum</label><select id="b-durum" name="durum"><option value="taslak"${r?.durum !== "yayinda" ? " selected" : ""}>Taslak</option><option value="yayinda"${r?.durum === "yayinda" ? " selected" : ""}>Yayında</option></select></div>
<div class="field"><label for="b-tarih">Yayın tarihi</label><input id="b-tarih" name="yayin_tarihi" type="date" value="${h(String(r?.yayin_tarihi || now()).slice(0, 10))}"></div></div>`;
}
async function blogAdminList(env: Env, flash = "") {
  await ensureBlogSeed(env);
  const rows = (await env.DB.prepare("SELECT id, slug, baslik, durum, yayin_tarihi, hub FROM bloglar ORDER BY yayin_tarihi DESC, id DESC").all<Row>()).results;
  return layout(
    "Blog",
    `<div class="adm-head"><h1>Blog <span class="muted">(${rows.length})</span></h1><a class="btn btn-primary btn-sm" href="/admin/blog/yeni">Yeni yazı</a></div>
${flash ? `<p class="flash ok" role="status">${h(flash)}</p>` : ""}
<p class="muted">Haftada 1–2 yazı idealdir. Yayınlanan yazılar site haritasına otomatik eklenir ve Bing/Yandex'e bildirilir.</p>
${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Başlık</th><th>Alan</th><th>Tarih</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td><a class="strong" href="/admin/blog/${r.id}">${h(r.baslik)}</a><span class="block small muted">/blog/${h(r.slug)}</span></td><td>${h(HUB_KAT[String(r.hub)]?.ad || "")}</td><td>${h(String(r.yayin_tarihi).slice(0, 10))}</td><td>${r.durum === "yayinda" ? '<span class="badge tone-ok">Yayında</span>' : '<span class="badge tone-muted">Taslak</span>'}</td><td>${r.durum === "yayinda" ? `<a class="small" href="/blog/${h(r.slug)}" target="_blank" rel="noopener">Gör</a>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><h2>Henüz yazı yok</h2></div>`}`,
  );
}
async function blogEdit(env: Env, id: number | null, err = "", draft: Row | null = null) {
  const r = draft || (id ? await env.DB.prepare("SELECT * FROM bloglar WHERE id = ?").bind(id).first<Row>() : null);
  if (id && !r) return null;
  return layout(
    id ? String(r!.baslik) : "Yeni yazı",
    `<p class="small"><a href="/admin/blog">Tüm yazılar</a></p><h1>${id ? h(r!.baslik) : "Yeni yazı"}</h1>${err ? `<p class="flash err" role="alert">${h(err)}</p>` : ""}
<form method="post" class="panel edit-form"><input type="hidden" name="action" value="kaydet">${blogForm(r)}<div class="row"><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div></form>
${id ? `<section class="panel danger" style="margin-top:20px"><h2 class="h-sm">Yazıyı sil</h2><form method="post"><input type="hidden" name="action" value="sil"><label class="check small"><input type="checkbox" name="onay" value="1" required> Silmek istediğimi onaylıyorum</label><button class="btn btn-danger btn-sm" type="submit">Sil</button></form></section>` : ""}`,
  );
}
function readBlog(fd: FormData): { ok: true; d: Row } | { ok: false; err: string; d: Row } {
  const d: Row = {
    baslik: clean(fd.get("baslik"), 120),
    slug: slugify(String(fd.get("slug") || "") || String(fd.get("baslik") || "")),
    hub: HUB_KAT[String(fd.get("hub"))] ? String(fd.get("hub")) : "studyo",
    ozet: clean(fd.get("ozet"), 200),
    icerik: String(fd.get("icerik") || "").replace(/\r/g, "").slice(0, 60000),
    kapak: clean(fd.get("kapak"), 200),
    kapak_alt: clean(fd.get("kapak_alt"), 200),
    ilgili: String(fd.get("ilgili") || "").replace(/\r/g, "").slice(0, 2000),
    durum: fd.get("durum") === "yayinda" ? "yayinda" : "taslak",
    yayin_tarihi: /^\d{4}-\d{2}-\d{2}$/.test(String(fd.get("yayin_tarihi"))) ? String(fd.get("yayin_tarihi")) + "T06:00:00.000Z" : now(),
  };
  if (!d.baslik || !d.slug) return { ok: false, err: "Başlık gerekli.", d };
  if (!d.ozet) return { ok: false, err: "Kısa açıklama gerekli.", d };
  if (!String(d.icerik).trim()) return { ok: false, err: "İçerik gerekli.", d };
  if (d.kapak && !/^\/(api\/medya\/\d+(\?v=[a-z0-9]+)?|assets\/[a-zA-Z0-9/_\-.]+)$/.test(String(d.kapak))) return { ok: false, err: "Kapak adresi /api/medya/… veya /assets/… olmalı.", d };
  return { ok: true, d };
}

// ------------------------------------------------------------------ görsel düzenleyici
const MAX_DESIGN = 400_000;
const designCache = new Map<string, { d: Design | null; t: number }>();

async function publishedDesign(env: Env, key: string): Promise<Design | null> {
  const c = designCache.get(key);
  if (c && Date.now() - c.t < 30_000) return c.d;
  let d: Design | null = null;
  try {
    const r = await env.DB.prepare("SELECT yayin FROM tasarimlar WHERE yol = ?").bind(key).first<Row>();
    if (r?.yayin) d = sanitizeDesign(JSON.parse(r.yayin));
    if (isEmptyDesign(d)) d = null;
  } catch {
    d = null; // tablo yoksa ya da veri bozuksa site olduğu gibi sunulur
  }
  designCache.set(key, { d, t: Date.now() });
  return d;
}

/** Sitedeki sayfalar (sitemap'ten) */
async function sitePages(env: Env, url: URL): Promise<{ yol: string; ad: string }[]> {
  const r = await env.ASSETS.fetch(new Request(new URL("/sitemap.xml", url).toString()));
  const xml = r.ok ? await r.text() : "";
  const NAMES: Record<string, string> = { "/": "Ana sayfa", "/hizmetler": "Hizmetler", "/hakkimizda": "Hakkımızda", "/nasil-calisir": "Nasıl çalışır?", "/fiyat-rehberi": "Fiyat rehberi", "/sss": "SSS", "/talep-olustur": "Talep oluştur" };
  const out = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    const yol = pageKey(new URL(m[1]).pathname);
    const ad = NAMES[yol] || yol.split("/").pop()!.replace(/-/g, " ").replace(/^./, (c) => c.toLocaleUpperCase("tr"));
    return { yol, ad };
  });
  const order = Object.keys(NAMES);
  return out.sort((a, b) => (order.indexOf(a.yol) + 1 || 99) - (order.indexOf(b.yol) + 1 || 99));
}

async function assetHtml(env: Env, url: URL, yol: string): Promise<string | null> {
  const r = await env.ASSETS.fetch(new Request(new URL(yol, url).toString()));
  if (!r.ok || !(r.headers.get("Content-Type") || "").includes("text/html")) return null;
  return r.text();
}

function previewResponse(body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

async function editorView(env: Env, url: URL) {
  const pages = await sitePages(env, url);
  const yol = pageKey(url.searchParams.get("yol") || "/");
  const page = pages.find((p) => p.yol === yol) || pages[0];
  const r = await env.DB.prepare("SELECT taslak, yayin, taslak_at, yayin_at FROM tasarimlar WHERE yol = ?").bind(page.yol).first<Row>();
  const parse = (v: unknown) => { try { return v ? sanitizeDesign(JSON.parse(String(v))) : null; } catch { return null; } };
  const data = { yol: page.yol, pages, taslak: parse(r?.taslak), yayin: parse(r?.yayin), taslak_at: r?.taslak_at || null, yayin_at: r?.yayin_at || null };
  const v = typeof __BUILD__ === "string" ? __BUILD__ : "1";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Görsel düzenleyici — Brif yönetim</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/fonts/brand.css"><link rel="stylesheet" href="/assets/editor.css?v=${v}"></head>
<body class="ed-body"><div id="ed-root" class="ed"><noscript>Görsel düzenleyici JavaScript gerektirir.</noscript></div>
<script type="application/json" id="ed-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script type="module" src="/assets/editor.js?v=${v}"></script></body></html>`;
}

async function saveDesign(req: Request, env: Env, url: URL) {
  if (!sameOrigin(req, url)) return json({ error: "İstek kaynağı doğrulanamadı." }, 403);
  const raw = await req.text();
  if (raw.length > MAX_DESIGN) return json({ error: "Tasarım çok büyük." }, 413);
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "Geçersiz veri." }, 400); }
  const yol = pageKey(String(body?.yol || ""));
  const pages = await sitePages(env, url);
  if (!pages.some((p) => p.yol === yol)) return json({ error: "Bilinmeyen sayfa." }, 400);
  const ts = now();
  if (body.islem === "kaldir") {
    await env.DB.prepare("UPDATE tasarimlar SET yayin = NULL, yayin_at = ? WHERE yol = ?").bind(ts, yol).run();
    designCache.delete(yol);
    return json({ ok: true, yayin_at: ts });
  }
  const d = sanitizeDesign(body.tasarim);
  const txt = JSON.stringify(d);
  const yayinla = body.islem === "yayinla";
  await env.DB.prepare(
    `INSERT INTO tasarimlar (yol, taslak, taslak_at, yayin, yayin_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(yol) DO UPDATE SET taslak = excluded.taslak, taslak_at = excluded.taslak_at${yayinla ? ", yayin = excluded.yayin, yayin_at = excluded.yayin_at" : ""}`,
  )
    .bind(yol, txt, ts, yayinla ? txt : null, yayinla ? ts : null)
    .run();
  if (yayinla) designCache.delete(yol);
  return json({ ok: true, taslak_at: ts, yayin_at: yayinla ? ts : undefined, tasarim: d });
}

// ---- görsel kütüphanesi (D1; aynı dosya ikinci kez yüklenmez)
async function hashHex(buf: Uint8Array<ArrayBuffer>) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const medyaUrl = (r: Row) => `/api/medya/${r.id}?v=${String(r.hash).slice(0, 10)}`;
async function medyaList(env: Env) {
  const rows = (await env.DB.prepare("SELECT id, ad, tur, boyut, alt, hash, created_at FROM medya ORDER BY id DESC LIMIT 500").all<Row>()).results;
  return rows.map((r) => ({ id: r.id, ad: r.ad, tur: r.tur, boyut: r.boyut, alt: r.alt, url: medyaUrl(r), tarih: r.created_at }));
}
async function medyaUpload(req: Request, env: Env, url: URL) {
  if (!sameOrigin(req, url)) return json({ error: "İstek kaynağı doğrulanamadı." }, 403);
  const fd = await req.formData();
  const f = fd.get("dosya");
  if (!f || typeof f === "string") return json({ error: "Dosya seçilmedi." }, 400);
  const file = f as File;
  if (file.size > FILE_RULES.maxBytes) return json({ error: "Görsel en fazla 1,5 MB olabilir (büyük görseller tarayıcıda otomatik küçültülür)." }, 413);
  const buf = new Uint8Array(await file.arrayBuffer());
  const tur = sniff(buf);
  if (!tur || !IMG_TYPES.includes(tur)) return json({ error: "Yalnızca JPG, PNG veya WebP görsel yükleyebilirsin." }, 415);
  const hash = await hashHex(buf);
  const old = await env.DB.prepare("SELECT id, ad, tur, boyut, alt, hash, created_at FROM medya WHERE hash = ?").bind(hash).first<Row>();
  if (old) return json({ ok: true, tekrar: true, medya: { id: old.id, ad: old.ad, tur: old.tur, boyut: old.boyut, alt: old.alt, url: medyaUrl(old) } });
  const ad = clean(file.name, 120) || "gorsel";
  const alt = clean(fd.get("alt"), 200);
  const r = await env.DB.prepare("INSERT INTO medya (ad, tur, boyut, alt, hash, veri, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(ad, tur, buf.byteLength, alt, hash, buf, now()).run();
  const row = { id: r.meta.last_row_id, ad, tur, boyut: buf.byteLength, alt, hash };
  return json({ ok: true, medya: { ...row, url: medyaUrl(row) } });
}
async function apiMedya(env: Env, id: number) {
  const r = await env.DB.prepare("SELECT tur, veri FROM medya WHERE id = ?").bind(id).first<Row>();
  if (!r) return new Response("Bulunamadı", { status: 404 });
  const data = r.veri instanceof ArrayBuffer ? new Uint8Array(r.veri) : new Uint8Array(r.veri as number[]);
  return new Response(data, { headers: { "Content-Type": r.tur, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
async function medyaView(env: Env, flash = "") {
  const list = await medyaList(env);
  return layout(
    "Görseller",
    `<div class="adm-head"><h1>Görseller <span class="muted">(${list.length})</span></h1></div>
${flash ? `<p class="flash ok" role="status">${h(flash)}</p>` : ""}
<p class="muted">Görsel düzenleyicide kullanılan görseller. Aynı dosyayı tekrar yüklersen yenisi oluşturulmaz, mevcut olan kullanılır. Yükleme ve seçim, düzenleyicideki görsel panelinden de yapılabilir.</p>
${
  list.length
    ? `<ul class="med-grid">${list
        .map(
          (m) => `<li><img src="${h(m.url)}" alt="" loading="lazy" width="200" height="150"><form method="post" action="/admin/medya/${m.id}" class="stack small"><label>Alternatif metin<input name="alt" maxlength="200" value="${h(m.alt)}"></label><span class="muted">${h(m.ad)} · ${Math.round(m.boyut / 1024)} KB</span><div class="row"><button class="btn btn-ghost btn-sm" type="submit" name="action" value="alt">Kaydet</button><button class="btn btn-danger btn-sm" type="submit" name="action" value="sil">Sil</button></div></form></li>`,
        )
        .join("")}</ul>`
    : `<div class="empty"><h2>Henüz görsel yok</h2><p>Görsel düzenleyicide bir görsel ögesi seçip "Görsel seç" ile yükleyebilirsin.</p></div>`
}`,
  );
}

// ------------------------------------------------------------------ özet ve ziyaretçiler
const nf = (n: number) => new Intl.NumberFormat("tr-TR").format(n);
const barList = (rows: [string, number][], total: number, fmt: (k: string) => string = h) =>
  rows.length
    ? `<ul class="vbar">${rows.map(([k, n]) => `<li><span class="vbar-k">${fmt(k)}</span><span class="vbar-n">${nf(n)}</span><span class="vbar-b" style="width:${Math.max(3, Math.round((n / Math.max(1, total)) * 100))}%"></span></li>`).join("")}</ul>`
    : `<p class="muted small">Henüz veri yok.</p>`;
function dailyChart(daily: Record<string, number>, days: number) {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(new Date(Date.now() + 3 * 36e5 - i * 864e5).toISOString().slice(0, 10));
  const max = Math.max(1, ...keys.map((k) => daily[k] || 0));
  const step = days > 31 ? Math.ceil(days / 15) : days > 14 ? 3 : 1;
  return `<div class="vchart" role="img" aria-label="Günlük ziyaretçi grafiği">${keys
    .map((k, i) => {
      const n = daily[k] || 0;
      const lbl = new Date(k + "T12:00:00Z").toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
      return `<div class="vc-col" title="${lbl}: ${n} ziyaretçi"><span class="vc-n">${n || ""}</span><span class="vc-bar" style="height:${Math.round((n / max) * 100)}%"></span><span class="vc-l">${i % step === 0 || i === keys.length - 1 ? lbl : ""}</span></div>`;
    })
    .join("")}</div>`;
}
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 6e4);
  return m < 1 ? "şimdi" : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.round(m / 60)} sa önce` : new Date(t).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
};

const sureFmt = (sn: number) => (sn <= 0 ? "—" : sn < 60 ? `${sn} sn` : sn < 3600 ? `${Math.floor(sn / 60)} dk${sn % 60 ? " " + (sn % 60) + " sn" : ""}` : `${Math.floor(sn / 3600)} sa ${Math.round((sn % 3600) / 60)} dk`);
const svcAd = (slug: string) => SERVICES.find((x) => x.slug === slug)?.name || slug;
const exAd = (e: string, ex: string) => (e === "form-basla" || e === "talep" || e === "butce-dusuk" ? svcAd(ex) : ex);
const ULKE: Record<string, string> = { TR: "Türkiye", US: "ABD", DE: "Almanya", GB: "İngiltere", NL: "Hollanda", FR: "Fransa", CA: "Kanada", IN: "Hindistan", AZ: "Azerbaycan", CY: "Kıbrıs", RU: "Rusya", SG: "Singapur", IE: "İrlanda", SE: "İsveç", BE: "Belçika", CH: "İsviçre", AT: "Avusturya", AE: "BAE", SA: "S. Arabistan", "?": "Bilinmiyor" };
const yerAd = (o: Oturum) => (o.ulke && o.ulke !== "TR" ? `${o.city || ""}${o.city ? ", " : ""}${ULKE[o.ulke] || o.ulke}` : [o.il, o.city && o.city !== o.il ? o.city : ""].filter(Boolean).join(" · ") || "Bilinmiyor");
const sonucRozet = (o: Oturum) => (o.sonuc === "talep" ? '<span class="badge tone-ok">Talep gönderdi</span>' : o.sonuc === "form" ? '<span class="badge tone-warn">Formu açtı</span>' : "");

async function ziyaretView(env: Env, url: URL) {
  const days = [1, 7, 30, 90].includes(Number(url.searchParams.get("gun"))) ? Number(url.searchParams.get("gun")) : 7;
  const tr = false;
  const s = await ziyaretStats(env.DB, days);
  const talepN = (await env.DB.prepare("SELECT COUNT(*) AS n FROM talepler WHERE created_at > ?").bind(new Date(Date.now() - days * 864e5).toISOString()).first<{ n: number }>())?.n ?? 0;
  const conv = s.visitors ? ((talepN / s.visitors) * 100).toFixed(1).replace(".", ",") : "0";
  const q = (o: Record<string, string>) => "?" + new URLSearchParams({ gun: String(days), ...(tr ? { tr: "1" } : {}), ...o }).toString();
  const tabs = [1, 7, 30, 90].map((d) => `<a class="vtab${d === days ? " is-on" : ""}" href="${q({ gun: String(d) })}">${d === 1 ? "Bugün" : `Son ${d} gün`}</a>`).join("");
  const trLink = `<a class="vtab${tr ? " is-on" : ""}" href="?${new URLSearchParams({ gun: String(days), ...(tr ? {} : { tr: "1" }) })}">${tr ? "✓ " : ""}Yalnız Türkiye</a>`;
  const pageLink = (p: string) => `<a href="${h(p)}" target="_blank" rel="noopener">${h(p)}</a>`;
  const H = s.huni;
  const huniRow = (l: string, n: number) => `<li><span class="vbar-k">${l}</span><span class="vbar-n">${nf(n)}${H.ziyaret ? ` <small class="muted">%${Math.round((n / H.ziyaret) * 100)}</small>` : ""}</span><span class="vbar-b" style="width:${Math.max(3, Math.round((n / Math.max(1, H.ziyaret)) * 100))}%"></span></li>`;
  return layout(
    "Ziyaretçiler",
    `<div class="adm-head"><h1>Ziyaretçiler</h1><nav class="vtabs" aria-label="Zaman aralığı">${tabs}</nav></div>
<div class="kpis"><div><span class="kpi-n">${nf(s.visitors)}</span><span class="kpi-l">Tekil ziyaretçi</span></div><div><span class="kpi-n">${nf(s.visits)}</span><span class="kpi-l">Ziyaret</span></div><div><span class="kpi-n">${sureFmt(s.ortSure)}</span><span class="kpi-l">Ortalama ziyaret süresi</span></div><div><span class="kpi-n">${nf(talepN)}</span><span class="kpi-l">Talep · %${conv} dönüşüm</span></div></div>
<div class="kpis kpis-sm"><div><span class="kpi-n">${nf(s.today)}</span><span class="kpi-l">Bugün</span></div><div><span class="kpi-n">${nf(s.views)}</span><span class="kpi-l">Sayfa görüntüleme</span></div><div><span class="kpi-n">${s.visits ? (s.views / s.visits).toFixed(1).replace(".", ",") : "0"}</span><span class="kpi-l">Ziyaret başına sayfa</span></div><div><span class="kpi-n">%${s.bounce}</span><span class="kpi-l">Tek sayfada çıkan</span></div></div>
${days > 1 ? `<section class="panel"><h2 class="h-sm">Günlük ziyaretçi</h2>${dailyChart(s.daily, days)}</section>` : ""}
<div class="grid-2"><section class="panel"><h2 class="h-sm">Nereden geliyorlar?</h2>${barList(s.sources, s.visits)}</section>
<section class="panel"><h2 class="h-sm">Hangi ilden?</h2>${barList(s.iller, s.visits)}</section></div>
<div class="grid-2"><section class="panel"><h2 class="h-sm">Neyle ilgileniyorlar?</h2>${barList(s.alanlar, s.visits)}${s.formHizmet.length ? `<h3 class="h-xs vsub">Formda seçilen hizmet</h3>${barList(s.formHizmet.map(([k, n]) => [svcAd(k), n] as [string, number]), s.formHizmet[0][1])}` : ""}</section>
<section class="panel"><h2 class="h-sm">Talebe giden yol</h2><ul class="vbar">${huniRow("Siteye giren", H.ziyaret)}${huniRow("Talep formunu açan", H.form)}${huniRow("Formu doldurmaya başlayan", H.basla)}${huniRow("3. adıma gelen", H.adim3)}${huniRow("Talep gönderen", H.talep)}</ul></section></div>
<section class="panel"><h2 class="h-sm">Sayfalar <span class="muted small">görüntüleme · ortalama süre</span></h2>${
      s.pages.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sayfa</th><th>Görüntüleme</th><th>Ort. süre</th></tr></thead><tbody>${s.pages.map((x) => `<tr><td><strong>${h(x.ti)}</strong><span class="block small muted">${pageLink(x.p)}</span></td><td>${nf(x.n)}</td><td>${sureFmt(x.ort)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted small">Henüz veri yok.</p>`
    }</section>
<div class="grid-2"><section class="panel"><h2 class="h-sm">En çok tıklananlar</h2>${barList(s.tiklar, s.tiklar[0]?.[1] || 1)}</section><section class="panel"><h2 class="h-sm">Cihaz</h2>${barList(s.devices, s.visits)}</section></div>
<section class="panel"><h2 class="h-sm">Son ziyaretler <span class="muted small">ayrıntı için satıra tıkla</span></h2>${
      s.recent.length
        ? `<div class="tbl-wrap"><table class="tbl vtbl"><thead><tr><th>Zaman</th><th>Kaynak</th><th>Konum · cihaz</th><th>İlgi</th><th>Süre</th><th>Gezdiği sayfalar</th></tr></thead><tbody>${s.recent
            .map((o) => {
              const link = `/admin/ziyaretciler/ziyaret?v=${o.vid}&t=${o.start}`;
              return `<tr><td class="nowrap"><a class="vrow" href="${link}">${ago(o.start)}</a></td><td>${h(o.src)}</td><td>${h(yerAd(o))}<span class="block small muted">${h(o.dev)}</span></td><td>${h(o.alan || "—")} ${sonucRozet(o)}</td><td class="nowrap">${sureFmt(o.sure)}</td><td class="vpath">${o.pages.slice(0, 6).map((x) => `<span title="${h(x.ti)}">${h(x.p)}</span>`).join(" → ")}${o.pages.length > 6 ? ` <span class="muted">+${o.pages.length - 6}</span>` : ""}</td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : `<div class="empty"><h2>Henüz ziyaret yok</h2><p>Site ziyaret edildikçe veriler burada görünür.</p></div>`
    }</section>
<p class="small muted">Çerez kullanılmaz, IP adresi saklanmaz. Yalnızca Türkiye'den gerçek ziyaretler gösterilir. Sistemin ayıkladıkları: senin ziyaretlerin (${nf(s.skipped.admin)}), yurt dışı (${nf(s.skipped.yabanci)}), bot ve sunucu trafiği (${nf(s.skipped.bot)}) sayfa görüntülemesi. Süre: sekmenin açık ve önde olduğu süre. Ziyaret: aynı kişinin 30 dakika içindeki gezintisi.</p>`,
  );
}

async function ziyaretDetayView(env: Env, url: URL) {
  const vid = (url.searchParams.get("v") || "").replace(/[^a-f0-9]/g, "").slice(0, 24);
  const t = Number(url.searchParams.get("t")) || 0;
  const { o, digerleri } = await oturumDetay(env.DB, vid, t);
  if (!o) return layout("Ziyaret", `<p class="small"><a href="/admin/ziyaretciler">← Ziyaretçiler</a></p><div class="empty"><h2>Ziyaret bulunamadı</h2></div>`);
  const zaman = (x: number) => new Date(x).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Istanbul" });
  const items = [...o.pages.map((p) => ({ ...p, k: "p" as const })), ...o.ev.map((e) => ({ ...e, k: "e" as const }))].sort((a, b) => a.t - b.t);
  const gun = new Date(o.start).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  const ilgi: Record<string, number> = {};
  for (const p of o.pages) { const a = alanOf(p.p); if (a) ilgi[a] = (ilgi[a] || 0) + Math.max(p.d, 1); }
  return layout(
    "Ziyaret ayrıntısı",
    `<p class="small"><a href="/admin/ziyaretciler">← Ziyaretçiler</a></p>
<div class="adm-head"><h1>Ziyaret · ${h(gun)}</h1>${sonucRozet(o)}</div>
<div class="kpis"><div><span class="kpi-n vk">${h(o.src)}</span><span class="kpi-l">Nereden geldi</span></div><div><span class="kpi-n vk">${h(yerAd(o))}</span><span class="kpi-l">Konum</span></div><div><span class="kpi-n vk">${sureFmt(o.sure)}</span><span class="kpi-l">Sitede geçirdiği süre</span></div><div><span class="kpi-n vk">${o.pages.length} sayfa</span><span class="kpi-l">${h(o.dev)}</span></div></div>
<div class="grid-2"><section class="panel"><h2 class="h-sm">Ziyaret akışı</h2><ol class="vtl">${items
      .map((x) =>
        x.k === "p"
          ? `<li class="vtl-p"><span class="vtl-t">${zaman(x.t)}</span><div><strong>${h(x.ti || x.p)}</strong><span class="block small muted"><a href="${h(x.p)}" target="_blank" rel="noopener">${h(x.p)}</a> · ${x.d ? sureFmt(x.d) + " baktı" : "süre ölçülemedi"}${x.sc ? ` · sayfanın %${x.sc}'ini gördü` : ""}</span></div></li>`
          : `<li class="vtl-e${x.e === "talep" ? " is-ok" : ""}"><span class="vtl-t">${zaman(x.t)}</span><div>${h(olayAd(x.e || "", exAd(x.e || "", x.ex || "")))}</div></li>`,
      )
      .join("")}</ol></section>
<section class="panel"><h2 class="h-sm">İlgi alanı</h2>${barList(Object.entries(ilgi).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n] as [string, number]), Math.max(1, ...Object.values(ilgi)), h).replace(/<span class="vbar-n">(\d+)<\/span>/g, (_m, n) => `<span class="vbar-n">${sureFmt(Number(n))}</span>`)}
${digerleri.length ? `<h3 class="h-xs vsub">Aynı gün diğer ziyaretleri</h3><ul class="olist">${digerleri.map((d) => `<li><a href="/admin/ziyaretciler/ziyaret?v=${d.vid}&t=${d.start}"><strong>${zaman(d.start)} · ${h(d.src)}</strong><span class="muted small">${d.pages.length} sayfa · ${sureFmt(d.sure)}</span></a>${sonucRozet(d)}</li>`).join("")}</ul>` : ""}
<p class="small muted" style="margin-top:16px">Aynı kişi ertesi gün gelirse yeni ziyaretçi olarak sayılır (kişisel veri tutulmadığı için).</p></section></div>`,
  );
}

async function ozetView(env: Env) {
  const s = await ziyaretStats(env.DB, 7);
  const since = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const cnt = async (q: string, ...a: unknown[]) => (await env.DB.prepare(q).bind(...a).first<{ n: number }>())?.n ?? 0;
  const t1 = await cnt("SELECT COUNT(*) AS n FROM talepler WHERE created_at > ?", since(1));
  const t7 = await cnt("SELECT COUNT(*) AS n FROM talepler WHERE created_at > ?", since(7));
  const t30 = await cnt("SELECT COUNT(*) AS n FROM talepler WHERE created_at > ?", since(30));
  const yeni = await cnt("SELECT COUNT(*) AS n FROM talepler WHERE durum = ?", STATUSES[0].key);
  const kat = (await env.DB.prepare("SELECT kategori_ad AS k, COUNT(*) AS n FROM talepler WHERE created_at > ? GROUP BY kategori_ad ORDER BY n DESC").bind(since(30)).all<{ k: string; n: number }>()).results;
  const son = (await env.DB.prepare("SELECT id, ref, created_at, hizmet_ad, ad, durum, butce_tur, butce, butce_dusuk FROM talepler ORDER BY created_at DESC LIMIT 6").all<Row>()).results;
  const butce = (await env.DB.prepare("SELECT COUNT(*) AS n, AVG(butce) AS ort, SUM(butce) AS top FROM talepler WHERE butce > 0 AND created_at > ?").bind(since(30)).first<{ n: number; ort: number; top: number }>()) || { n: 0, ort: 0, top: 0 };
  return layout(
    "Özet",
    `<div class="adm-head"><h1>Özet</h1><a class="btn btn-primary btn-sm" href="/admin">Taleplere git</a></div>
<div class="kpis"><div><span class="kpi-n">${nf(yeni)}</span><span class="kpi-l">Cevap bekleyen talep</span></div><div><span class="kpi-n">${nf(t1)}</span><span class="kpi-l">Son 24 saatte talep</span></div><div><span class="kpi-n">${nf(t7)}</span><span class="kpi-l">Son 7 günde talep</span></div><div><span class="kpi-n">${nf(t30)}</span><span class="kpi-l">Son 30 günde talep</span></div></div>
<div class="kpis kpis-sm"><div><span class="kpi-n">${nf(s.today)}</span><span class="kpi-l">Bugün ziyaretçi</span></div><div><span class="kpi-n">${nf(s.visitors)}</span><span class="kpi-l">7 günde ziyaretçi</span></div><div><span class="kpi-n">${nf(s.views)}</span><span class="kpi-l">7 günde sayfa görüntüleme</span></div><div><span class="kpi-n">${butce.n ? tl(Math.round(butce.ort)) : "—"}</span><span class="kpi-l">Ortalama bütçe (30 gün)</span></div></div>
<section class="panel"><div class="adm-head" style="margin-bottom:8px"><h2 class="h-sm" style="margin:0">Son 7 gün ziyaretçi</h2><a class="small" href="/admin/ziyaretciler">Ayrıntılar</a></div>${dailyChart(s.daily, 7)}</section>
<div class="grid-2"><section class="panel"><div class="adm-head" style="margin-bottom:8px"><h2 class="h-sm" style="margin:0">Son talepler</h2><a class="small" href="/admin">Tümü</a></div>${
      son.length
        ? `<ul class="olist">${son.map((r) => `<li><a href="/admin/talep/${r.id}"><strong>${h(r.hizmet_ad)}</strong><span class="muted small">${h(r.ref)} · ${h(r.ad || "")} · ${fmtDT(r.created_at)}</span></a>${badge(r.durum)}</li>`).join("")}</ul>`
        : `<p class="muted small">Henüz talep yok.</p>`
    }</section>
<section class="panel"><h2 class="h-sm">Kategoriye göre talep (30 gün)</h2>${barList(kat.map((x) => [x.k || "—", x.n] as [string, number]), t30)}<h2 class="h-sm" style="margin-top:20px">Ziyaretçi kaynağı (7 gün)</h2>${barList(s.sources.slice(0, 5), s.visits)}</section></div>`,
  );
}

// ------------------------------------------------------------------ yönlendirme
async function admin(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname.replace(/\/+$/, "") || "/admin";
  if (!env.ADMIN_PASSWORD) return html(loginView("", true), 503);

  if (p === "/admin/giris" && req.method === "POST") {
    if (!sameOrigin(req, url)) return html(loginView("İstek kaynağı doğrulanamadı."), 403);
    const ipKey = await sha("ip:" + clientIp(req) + env.ADMIN_PASSWORD);
    if (!(await rateLimit(env, "login:" + ipKey, 8, 900))) return html(loginView("Çok fazla deneme yapıldı. 15 dakika sonra tekrar dene."), 429);
    const fd = await req.formData();
    const pw = String(fd.get("password") || "");
    const ok = safeEq(await hmac("cmp", pw), await hmac("cmp", env.ADMIN_PASSWORD));
    if (!ok) return html(loginView("Şifre hatalı."), 401);
    return redirect("/admin/ozet", { "Set-Cookie": await sessionCookie(env) });
  }
  if (!(await isAuthed(req, env))) return html(loginView(), 401);

  if (p === "/admin/cikis" && req.method === "POST") return redirect("/admin", { "Set-Cookie": `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  await markAdmin(req, env.DB);
  if (p === "/admin/ozet") return html(await ozetView(env));
  if (p === "/admin/ziyaretciler") return html(await ziyaretView(env, url));
  if (p === "/admin/ziyaretciler/ziyaret") return html(await ziyaretDetayView(env, url));
  if (p === "/admin" || p === "/admin/giris") return html(await listView(env, url));
  if (p === "/admin/talepler.csv") return csv(env);
  if (p === "/admin/blog") return html(await blogAdminList(env, clean(url.searchParams.get("ok"), 80)));
  const bm = p.match(/^\/admin\/blog\/(yeni|\d+)$/);
  if (bm) {
    const id = bm[1] === "yeni" ? null : Number(bm[1]);
    if (req.method === "POST") {
      if (!sameOrigin(req, url)) return html(layout("Hata", "<h1>İstek kaynağı doğrulanamadı.</h1>"), 403);
      const fd = await req.formData();
      if (id && fd.get("action") === "sil" && fd.get("onay") === "1") {
        await env.DB.prepare("DELETE FROM bloglar WHERE id = ?").bind(id).run();
        return redirect("/admin/blog?ok=" + encodeURIComponent("Yazı silindi."));
      }
      const r = readBlog(fd);
      if (!r.ok) return html((await blogEdit(env, id, r.err, r.d))!, 422);
      const d = r.d;
      const clash = await env.DB.prepare("SELECT id FROM bloglar WHERE slug = ? AND id != ?").bind(d.slug, id || 0).first<Row>();
      if (clash) return html((await blogEdit(env, id, "Bu adres başka bir yazıda kullanılıyor.", d))!, 422);
      const ts = now();
      if (id) await env.DB.prepare("UPDATE bloglar SET slug=?, baslik=?, ozet=?, icerik=?, kapak=?, kapak_alt=?, hub=?, ilgili=?, durum=?, yayin_tarihi=?, updated_at=? WHERE id=?").bind(d.slug, d.baslik, d.ozet, d.icerik, d.kapak, d.kapak_alt, d.hub, d.ilgili, d.durum, d.yayin_tarihi, ts, id).run();
      else await env.DB.prepare("INSERT INTO bloglar (slug, baslik, ozet, icerik, kapak, kapak_alt, hub, ilgili, durum, yayin_tarihi, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(d.slug, d.baslik, d.ozet, d.icerik, d.kapak, d.kapak_alt, d.hub, d.ilgili, d.durum, d.yayin_tarihi, ts, ts).run();
      if (d.durum === "yayinda") await indexNow(url, ["/blog/" + d.slug, "/blog"]);
      return redirect("/admin/blog?ok=" + encodeURIComponent(d.durum === "yayinda" ? "Yazı yayınlandı." : "Taslak kaydedildi."));
    }
    const v = await blogEdit(env, id);
    return v ? html(v) : html(layout("Bulunamadı", "<h1>Yazı bulunamadı</h1>"), 404);
  }
  if (p === "/admin/duzenleyici") return html(await editorView(env, url));
  if (p === "/admin/onizle") {
    const yol = pageKey(url.searchParams.get("yol") || "/");
    const pages = await sitePages(env, url);
    if (!pages.some((x) => x.yol === yol)) return html(layout("Bulunamadı", "<h1>Sayfa bulunamadı</h1>"), 404);
    const base = await assetHtml(env, url, yol);
    if (!base) return html(layout("Bulunamadı", "<h1>Sayfa bulunamadı</h1>"), 404);
    if (url.searchParams.get("ham") === "1") return previewResponse(applyDesign(base, { v: 1 }, { stripScripts: true }));
    const r = await env.DB.prepare("SELECT taslak FROM tasarimlar WHERE yol = ?").bind(yol).first<Row>();
    let d: Design = { v: 1 };
    try { if (r?.taslak) d = sanitizeDesign(JSON.parse(r.taslak)); } catch {}
    const bar = `<div style="position:fixed;z-index:2147483000;left:12px;bottom:12px;background:#191919;color:#fff;font:500 13px/1.3 Geist,Inter,sans-serif;padding:8px 12px;border-radius:10px">Taslak önizleme · ziyaretçiler bunu görmez</div>`;
    return previewResponse(applyDesign(base, d).replace("</body>", bar + "</body>"));
  }
  if (p === "/admin/tasarim" && req.method === "POST") return await saveDesign(req, env, url);
  if (p === "/admin/medya.json") return json({ medya: await medyaList(env) });
  if (p === "/admin/medya" && req.method === "POST") return await medyaUpload(req, env, url);
  if (p === "/admin/medya") return html(await medyaView(env, clean(url.searchParams.get("ok"), 80)));
  const mm = p.match(/^\/admin\/medya\/(\d+)$/);
  if (mm && req.method === "POST") {
    if (!sameOrigin(req, url)) return html(layout("Hata", "<h1>İstek kaynağı doğrulanamadı.</h1>"), 403);
    const ct = req.headers.get("Content-Type") || "";
    const body: Record<string, unknown> = ct.includes("application/json") ? await req.json() : Object.fromEntries(await req.formData());
    const id = Number(mm[1]);
    if (body.action === "sil") await env.DB.prepare("DELETE FROM medya WHERE id = ?").bind(id).run();
    else await env.DB.prepare("UPDATE medya SET alt = ? WHERE id = ?").bind(clean(body.alt, 200), id).run();
    if (ct.includes("application/json")) return json({ ok: true });
    return redirect("/admin/medya?ok=" + encodeURIComponent(body.action === "sil" ? "Görsel silindi." : "Kaydedildi."));
  }
  if (p === "/admin/gorsel.js") return new Response(GORSEL_JS, { headers: { "Content-Type": "text/javascript; charset=utf-8", ...SEC_HEADERS } });
  if (p === "/admin/profiller") {
    if (req.method === "POST") {
      if (!sameOrigin(req, url)) return html(layout("Hata", "<h1>İstek kaynağı doğrulanamadı.</h1>"), 403);
      const d = readProfil(await req.formData());
      if (typeof d === "string") return html(await profillerView(env, "", d), 422);
      await env.DB.prepare("INSERT INTO profiller (ad, unvan, aciklama, alanlar, gorsel, sira, yayinda, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(d.ad, d.unvan, d.aciklama, d.alanlar, d.gorsel, d.sira, d.yayinda, now()).run();
      return redirect("/admin/profiller?ok=" + encodeURIComponent("Profil eklendi."));
    }
    return html(await profillerView(env, clean(url.searchParams.get("ok"), 80)));
  }
  const pm = p.match(/^\/admin\/profiller\/(\d+)$/);
  if (pm) {
    const id = Number(pm[1]);
    if (req.method === "POST") {
      if (!sameOrigin(req, url)) return html(layout("Hata", "<h1>İstek kaynağı doğrulanamadı.</h1>"), 403);
      const d = readProfil(await req.formData());
      if (typeof d === "string") {
        const v = await profilEditView(env, id, d);
        return v ? html(v, 422) : html(layout("Bulunamadı", "<h1>Profil bulunamadı</h1>"), 404);
      }
      await env.DB.prepare("UPDATE profiller SET ad = ?, unvan = ?, aciklama = ?, alanlar = ?, gorsel = ?, sira = ?, yayinda = ?, updated_at = ? WHERE id = ?").bind(d.ad, d.unvan, d.aciklama, d.alanlar, d.gorsel, d.sira, d.yayinda, now(), id).run();
      return redirect("/admin/profiller?ok=" + encodeURIComponent("Profil kaydedildi."));
    }
    const v = await profilEditView(env, id);
    return v ? html(v) : html(layout("Bulunamadı", "<h1>Profil bulunamadı</h1>"), 404);
  }
  if (p === "/admin/isler") {
    if (req.method === "POST") {
      if (!sameOrigin(req, url)) return html(layout("Hata", "<h1>İstek kaynağı doğrulanamadı.</h1>"), 403);
      const r = await readIsForm(await req.formData(), true);
      if (!r.ok) return html(await islerView(env, "", r.err), 422);
      const ts = now();
      await env.DB.prepare("INSERT INTO isler (baslik, kategori, aciklama, link, sira, yayinda, tur, boyut, gorsel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(r.d.baslik, r.d.kategori, r.d.aciklama, r.d.link, r.d.sira, r.d.yayinda, r.d.tur, (r.d.gorsel as Uint8Array).byteLength, r.d.gorsel, ts, ts)
        .run();
      worksCache.clear();
      return redirect("/admin/isler?ok=" + encodeURIComponent("İş eklendi."));
    }
    return html(await islerView(env, clean(url.searchParams.get("ok"), 80)));
  }
  const im = p.match(/^\/admin\/isler\/(\d+)$/);
  if (im) {
    const id = Number(im[1]);
    if (req.method === "POST") {
      if (!sameOrigin(req, url)) return html(layout("Hata", "<h1>İstek kaynağı doğrulanamadı.</h1>"), 403);
      const fd = await req.formData();
      if (fd.get("action") === "sil" && fd.get("onay") === "1") {
        await env.DB.prepare("DELETE FROM isler WHERE id = ?").bind(id).run();
        worksCache.clear();
      return redirect("/admin/isler?ok=" + encodeURIComponent("İş silindi."));
      }
      const r = await readIsForm(fd, false);
      if (!r.ok) {
        const v = await isEditView(env, id, r.err);
        return v ? html(v, 422) : html(layout("Bulunamadı", "<h1>İş bulunamadı</h1>"), 404);
      }
      const ts = now();
      await env.DB.prepare("UPDATE isler SET baslik = ?, kategori = ?, aciklama = ?, link = ?, sira = ?, yayinda = ?, updated_at = ? WHERE id = ?").bind(r.d.baslik, r.d.kategori, r.d.aciklama, r.d.link, r.d.sira, r.d.yayinda, ts, id).run();
      if (r.d.gorsel) await env.DB.prepare("UPDATE isler SET tur = ?, boyut = ?, gorsel = ? WHERE id = ?").bind(r.d.tur, (r.d.gorsel as Uint8Array).byteLength, r.d.gorsel, id).run();
      worksCache.clear();
      return redirect("/admin/isler?ok=" + encodeURIComponent("Değişiklikler kaydedildi."));
    }
    const v = await isEditView(env, id);
    return v ? html(v) : html(layout("Bulunamadı", "<h1>İş bulunamadı</h1>"), 404);
  }

  let m = p.match(/^\/admin\/dosya\/(\d+)$/);
  if (m) {
    const f = await env.DB.prepare("SELECT ad, tur, veri FROM dosyalar WHERE id = ?").bind(Number(m[1])).first<Row>();
    if (!f) return html(layout("Bulunamadı", "<h1>Dosya bulunamadı</h1>"), 404);
    const data = f.veri instanceof ArrayBuffer ? new Uint8Array(f.veri) : new Uint8Array(f.veri as number[]);
    return new Response(data, { headers: { "Content-Type": f.tur, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.ad)}`, ...SEC_HEADERS } });
  }

  m = p.match(/^\/admin\/talep\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (req.method === "POST") {
      if (!sameOrigin(req, url)) return html(layout("Hata", "<h1>İstek kaynağı doğrulanamadı.</h1>"), 403);
      const fd = await req.formData();
      const a = String(fd.get("action") || "");
      const ts = now();
      let msg = "";
      if (a === "durum") {
        const d = String(fd.get("durum") || "");
        if (!STATUSES.some((s) => s.key === d)) return html(layout("Hata", "<h1>Geçersiz durum</h1>"), 400);
        await env.DB.prepare("UPDATE talepler SET durum = ?, updated_at = ? WHERE id = ?").bind(d, ts, id).run();
        await env.DB.prepare("INSERT INTO notlar (talep_id, metin, created_at) VALUES (?, ?, ?)").bind(id, `Durum: ${statusOf(d).label}`, ts).run();
        msg = "Durum güncellendi.";
      } else if (a === "profil") {
        const pid = Number(fd.get("profil_id")) || null;
        const pr = pid ? (await profilMap(env)).get(pid) : undefined;
        if (pid && !pr) return html(layout("Hata", "<h1>Geçersiz profil</h1>"), 400);
        await env.DB.prepare("UPDATE talepler SET profil_id = ?, updated_at = ? WHERE id = ?").bind(pid, ts, id).run();
        await env.DB.prepare("INSERT INTO notlar (talep_id, metin, created_at) VALUES (?, ?, ?)").bind(id, `Yanıtlayan profil: ${pr ? pr.ad : "seçilmedi"}`, ts).run();
        msg = "Profil kaydedildi.";
      } else if (a === "not") {
        const t = clean(fd.get("metin"), 2000, true);
        if (t) await env.DB.prepare("INSERT INTO notlar (talep_id, metin, created_at) VALUES (?, ?, ?)").bind(id, t, ts).run();
        msg = "Not eklendi.";
      } else if (a === "iletisim") {
        await env.DB.prepare("UPDATE talepler SET son_iletisim = ?, updated_at = ? WHERE id = ?").bind(ts, ts, id).run();
        await env.DB.prepare("INSERT INTO notlar (talep_id, metin, created_at) VALUES (?, ?, ?)").bind(id, "Müşteriyle iletişime geçildi.", ts).run();
        msg = "İletişim tarihi kaydedildi.";
      } else if (a === "sil" && fd.get("onay") === "1") {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM dosyalar WHERE talep_id = ?").bind(id),
          env.DB.prepare("DELETE FROM notlar WHERE talep_id = ?").bind(id),
          env.DB.prepare("DELETE FROM talepler WHERE id = ?").bind(id),
        ]);
        return redirect("/admin");
      }
      return redirect(`/admin/talep/${id}?ok=${encodeURIComponent(msg)}`);
    }
    const v = await detailView(env, id, clean(url.searchParams.get("ok"), 80));
    return v ? html(v) : html(layout("Bulunamadı", "<h1>Talep bulunamadı</h1>"), 404);
  }
  return html(layout("Bulunamadı", "<h1>Sayfa bulunamadı</h1>"), 404);
}

// ---- Alan sayfalarının portfolyosu (Admin → Örnek işler; kategoriye göre alan)
const HUB_PATHS: Record<string, string> = { "/": "studyo", "/tasarim": "tasarim", "/dijital": "dijital" };
const ALAN_KAT: Record<string, string[]> = { studyo: ["Fotoğraf", "Video"], tasarim: ["Grafik tasarım", "Metin & içerik"], dijital: ["Web tasarım", "Reklam", "Sosyal medya"] };
const worksCache = new Map<string, { html: string; t: number }>();
async function injectWorks(env: Env, page: string, alan: string): Promise<string> {
  const re = new RegExp(`<!--ISLER:${alan}-->[\\s\\S]*?<!--/ISLER-->`);
  if (!re.test(page)) return page;
  let c = worksCache.get(alan);
  if (!c || Date.now() - c.t > 60_000) {
    let html = "";
    try {
      const kats = ALAN_KAT[alan] || [];
      const rows = (await env.DB.prepare(`SELECT id, baslik, kategori, aciklama, link, updated_at FROM isler WHERE yayinda = 1 AND kategori IN (${kats.map(() => "?").join(",")}) ORDER BY sira, id LIMIT 60`).bind(...kats).all<Row>()).results;
      html = rows
        .map((r) => {
          const src = `/api/isler/${r.id}?v=${String(r.updated_at).replace(/\D/g, "")}`;
          const inner = `<img src="${h(src)}" alt="${h(r.baslik)}" loading="lazy" decoding="async"><figcaption><span>${h(r.kategori)}</span>${h(r.baslik)}</figcaption>`;
          const link = String(r.link || "");
          const safe = /^(https:\/\/|\/(?!\/))/.test(link);
          return `<figure class="pf-item">${safe ? `<a href="${h(link)}"${link.startsWith("https") ? ' target="_blank" rel="noopener"' : ""}>${inner}</a>` : inner}</figure>`;
        })
        .join("");
    } catch {
      html = "";
    }
    c = { html, t: Date.now() };
    worksCache.set(alan, c);
  }
  return c.html ? page.replace(re, c.html) : page;
}

/** Statik sayfa; yayınlanmış görsel tasarımı varsa uygulanmış hali */
async function servePage(req: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/sitemap.xml") return sitemapXml(env, url);
  if (url.pathname === "/blog-sablon" || url.pathname === "/blog-sablon/") {
    const nf = await env.ASSETS.fetch(new Request(new URL("/404", url).toString()));
    return new Response(nf.body, { status: 404, headers: nf.headers });
  }
  const bp = url.pathname.match(/^\/blog(?:\/([a-z0-9-]{1,80}))?\/?$/);
  if (bp && (req.method === "GET" || req.method === "HEAD")) {
    let res: Response | null = null;
    try { res = await blogPage(env, url, bp[1] || null); } catch { res = null; }
    if (res) return res;
    const nf = await env.ASSETS.fetch(new Request(new URL("/404", url).toString()));
    return new Response(nf.body, { status: 404, headers: nf.headers });
  }
  const res = await env.ASSETS.fetch(req);
  if ((req.method !== "GET" && req.method !== "HEAD") || res.status !== 200 || !(res.headers.get("Content-Type") || "").includes("text/html")) return res;
  const key = pageKey(url.pathname);
  const alan = HUB_PATHS[key];
  const d = await publishedDesign(env, key);
  if (!d && !alan) return res;
  let out = await res.text();
  if (alan) out = await injectWorks(env, out, alan);
  if (d) out = applyDesign(out, d);
  const headers = new Headers(res.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(req.method === "HEAD" ? null : out, { status: 200, headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/talep" && req.method === "POST") return await createTalep(req, env, url);
      if (url.pathname === "/api/ziyaret" && req.method === "POST") {
        try { await recordHit(req, env.DB); } catch (e) { console.error("ziyaret", (e as Error).message); }
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/api/isler" && req.method === "GET") return await apiIsler(env);
      const ig = url.pathname.match(/^\/api\/isler\/(\d+)$/);
      if (ig && req.method === "GET") return await apiIsGorsel(env, Number(ig[1]));
      if (url.pathname === "/api/saglik") return json({ ok: true, hizmet: SERVICES.length, kategori: CATEGORIES.length });
      const md = url.pathname.match(/^\/api\/medya\/(\d+)$/);
      if (md && req.method === "GET") return await apiMedya(env, Number(md[1]));
      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
        const r = await admin(req, env, url);
        // Admin'e giren cihaz "ben" çerezi alır: bu cihazdan siteye yapılan ziyaretler sayılmaz
        if (!/(?:^|;\s*)brif_ben=1/.test(req.headers.get("Cookie") || "") && (await isAuthed(req, env))) {
          const res = new Response(r.body, r);
          res.headers.append("Set-Cookie", "brif_ben=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax");
          return res;
        }
        return r;
      }
      return await servePage(req, env, url);
    } catch (e) {
      console.error("worker hata", (e as Error).message);
      if (url.pathname.startsWith("/api/")) return json({ error: "Beklenmeyen bir hata oluştu. Lütfen tekrar dene." }, 500);
      return html(layout("Hata", "<h1>Beklenmeyen bir hata oluştu</h1>", false), 500);
    }
  },
};

export { categoryBySlug };
