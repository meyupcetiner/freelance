// Yönetim paneli yönlendirmeleri. Her istek sunucuda oturum + rol kontrolünden, her POST CSRF kontrolünden geçer.
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { config } from "../lib/config";
import { q, now, tx } from "../lib/db";
import { assertSameOrigin, HttpError, readForm, redirect, send, type Ctx } from "../lib/http";
import { assertCsrf, audit, createSession, csrfToken, currentUser, destroySession, hashPassword, rateLimit, requireUser, verifyPassword, type User } from "../lib/security";
import { categories, DEFAULT_SETTINGS, pages, saveSettings, serviceById, services, settings, statuses, type Settings } from "../lib/repo";
import { clean } from "../lib/requests";
import { serviceBySlug as catalogService } from "../data/catalog";
import { mailConfigured } from "../lib/mail";
import type { Pricing, Question, PricingAddon, PricingTier } from "../lib/pricing";
import {
  AccountView, AdminLayout, LoginView, OverviewView, PageEditView, PagesView, RequestDetailView, RequestsView,
  ServiceEditView, ServicesView, SettingsView, StatusesView, UsersView, TIMING_LABEL, PREF_LABEL, type Overview,
} from "./views";

const RESERVED = new Set(["admin", "api", "hizmetler", "talep-olustur", "nasil-calisir", "fiyat-rehberi", "sss", "sitemap.xml", "robots.txt", "assets", "fonts", "uploads"]);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function render(ctx: Ctx, user: User | null, title: string, body: ReactElement, opts: { active?: string; status?: number; error?: string } = {}) {
  const html = "<!doctype html>" + renderToStaticMarkup(
    <AdminLayout title={title} user={user} csrf={user ? csrfToken(user) : ""} s={settings()} active={opts.active} flash={ctx.url.searchParams.get("ok")} error={opts.error}>
      {body}
    </AdminLayout>,
  );
  send(ctx, opts.status ?? 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
}

async function form(ctx: Ctx, user: User) {
  assertSameOrigin(ctx);
  const f = await readForm(ctx);
  assertCsrf(user, f.get("csrf"));
  return f;
}

export async function handleAdmin(ctx: Ctx): Promise<boolean> {
  const p = ctx.url.pathname;
  const M = ctx.method;

  // ---------------------------------------------------------------- giriş / çıkış
  if (p === "/admin/giris") {
    const r = safeReturn(ctx.url.searchParams.get("r"));
    if (M === "GET") {
      if (currentUser(ctx)) return redirect(ctx, r), true;
      render(ctx, null, "Giriş", <LoginView r={r} />);
      return true;
    }
    if (M === "POST") {
      assertSameOrigin(ctx);
      const f = await readForm(ctx);
      const email = clean(f.get("email"), 160).toLowerCase();
      const ret = safeReturn(f.get("r"));
      if (!rateLimit(ctx, "login", 8, 900)) {
        render(ctx, null, "Giriş", <LoginView r={ret} email={email} error="Çok fazla deneme yapıldı. 15 dakika sonra tekrar dene." />, { status: 429 });
        return true;
      }
      const u = q.get<any>("SELECT id, password_hash, active FROM users WHERE email = ?", email);
      // Kullanıcı yoksa da aynı sürede yanıt vermek için sahte bir doğrulama yapılır
      const ok = u ? await verifyPassword(f.get("password") || "", u.password_hash) : (await hashPassword("x"), false);
      if (!u || !ok || !u.active) {
        render(ctx, null, "Giriş", <LoginView r={ret} email={email} error="E-posta veya parola hatalı." />, { status: 401 });
        return true;
      }
      createSession(ctx, u.id);
      audit(u.id, "login");
      redirect(ctx, ret);
      return true;
    }
  }
  if (p === "/admin/cikis" && M === "POST") {
    const u = currentUser(ctx);
    if (u) {
      await form(ctx, u);
      audit(u.id, "logout");
    }
    destroySession(ctx);
    redirect(ctx, "/admin/giris");
    return true;
  }

  // ---------------------------------------------------------------- bundan sonrası oturum ister
  const user = requireUser(ctx);
  const isAdmin = user.role === "admin";
  const csrf = csrfToken(user);
  const adminOnly = () => {
    if (!isAdmin) throw new HttpError(403, "Bu bölüm yalnızca yöneticiler içindir.");
  };

  if (p === "/admin" && M === "GET") {
    if (!isAdmin) return redirect(ctx, "/admin/hizmetler"), true;
    render(ctx, user, "Genel bakış", <OverviewView o={overview()} />, { active: "overview" });
    return true;
  }

  // ---------------------------------------------------------------- talepler
  if (p === "/admin/talepler" || p === "/admin/talepler.csv") {
    adminOnly();
    const f = {
      q: clean(ctx.url.searchParams.get("q"), 100),
      durum: clean(ctx.url.searchParams.get("durum"), 40),
      kategori: clean(ctx.url.searchParams.get("kategori"), 40),
      sirala: clean(ctx.url.searchParams.get("sirala"), 20),
      sayfa: clean(ctx.url.searchParams.get("sayfa"), 5),
    };
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (f.q) {
      where.push("(r.ref LIKE ? OR r.contact_name LIKE ? OR r.contact_email LIKE ? OR r.contact_phone LIKE ? OR r.description LIKE ? OR r.company LIKE ?)");
      const like = "%" + f.q.replace(/[%_\\]/g, (c) => "\\" + c) + "%";
      args.push(like, like, like, like, like, like);
      where[where.length - 1] = where[where.length - 1].replace(/LIKE \?/g, "LIKE ? ESCAPE '\\'");
    }
    if (f.durum === "acik") where.push("st.is_open = 1");
    else if (f.durum) {
      where.push("st.key = ?");
      args.push(f.durum);
    }
    if (f.kategori) {
      where.push("r.category_slug = ?");
      args.push(f.kategori);
    }
    const order = { eski: "r.created_at ASC", butce: "COALESCE(r.budget_amount, -1) DESC, r.created_at DESC", iletisim: "COALESCE(r.last_contact_at, '') ASC, r.created_at ASC" }[f.sirala] || "r.created_at DESC";
    const W = where.length ? " WHERE " + where.join(" AND ") : "";
    const base = ` FROM requests r JOIN statuses st ON st.id = r.status_id${W}`;
    if (p.endsWith(".csv")) {
      const rows = q.all<any>(`SELECT r.*, st.label AS status_label${base} ORDER BY ${order} LIMIT 5000`, ...args);
      audit(user.id, "export_csv", `${rows.length} satır`);
      const esc = (v: unknown) => {
        let s = v === null || v === undefined ? "" : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV formül enjeksiyonuna karşı
        return `"${s.replace(/"/g, '""')}"`;
      };
      const head = ["Talep no", "Tarih", "Hizmet", "Açıklama", "Bütçe", "Bütçe türü", "Rehber alt sınır", "Zamanlama", "Tarih (iş)", "Ad", "E-posta", "Telefon", "Tercih", "Firma", "Durum", "Son iletişim", "UTM kaynak", "Yönlendiren"];
      const lines = rows.map((r) => [r.ref, r.created_at, r.service_name, r.description, r.budget_amount, r.budget_mode, r.estimate_min, TIMING_LABEL[r.timing] || r.timing, r.timing_date, r.contact_name, r.contact_email, r.contact_phone, PREF_LABEL[r.contact_pref], r.company, r.status_label, r.last_contact_at, r.src_source, r.src_referrer].map(esc).join(";"));
      send(ctx, 200, "﻿" + [head.map(esc).join(";"), ...lines].join("\r\n"), "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="talepler-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" });
      return true;
    }
    const total = q.get<{ n: number }>("SELECT COUNT(*) AS n" + base, ...args)!.n;
    const per = 25;
    const pagesN = Math.max(1, Math.ceil(total / per));
    const page = Math.min(pagesN, Math.max(1, Number(f.sayfa) || 1));
    const rows = q.all<any>(
      `SELECT r.id, r.ref, r.created_at, r.service_name, r.budget_amount, r.budget_mode, r.budget_warned, r.timing, r.contact_name, r.last_contact_at, st.label AS status_label, st.tone AS status_tone${base} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...args, per, (page - 1) * per,
    );
    render(ctx, user, "Talepler", <RequestsView rows={rows} total={total} page={page} pages={pagesN} f={f} statuses={statuses()} cats={categories()} />, { active: "requests" });
    return true;
  }
  let m = p.match(/^\/admin\/talepler\/(\d+)$/);
  if (m) {
    adminOnly();
    const id = Number(m[1]);
    const get = () => q.get<any>("SELECT r.*, st.label AS status_label, st.tone AS status_tone FROM requests r JOIN statuses st ON st.id = r.status_id WHERE r.id = ?", id);
    const r = get();
    if (!r) return false;
    if (M === "POST") {
      const f = await form(ctx, user);
      const action = f.get("action");
      const log = (kind: string, body: string) => q.run("INSERT INTO request_activity (request_id, user_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)", id, user.id, kind, body, now());
      if (action === "status") {
        const st = q.get<any>("SELECT id, label FROM statuses WHERE id = ?", Number(f.get("status_id")));
        if (!st) throw new HttpError(400, "Geçersiz durum.");
        if (st.id !== r.status_id) {
          tx(() => {
            q.run("UPDATE requests SET status_id = ?, updated_at = ? WHERE id = ?", st.id, now(), id);
            log("status", `Durum: ${r.status_label} → ${st.label}`);
          });
        }
        return redirect(ctx, `/admin/talepler/${id}?ok=status`), true;
      }
      if (action === "note") {
        const body = clean(f.get("body"), 2000, true);
        if (body) log("note", body);
        return redirect(ctx, `/admin/talepler/${id}?ok=note`), true;
      }
      if (action === "contact") {
        tx(() => {
          q.run("UPDATE requests SET last_contact_at = ?, updated_at = ? WHERE id = ?", now(), now(), id);
          log("contact", "Müşteriye dönüş yapıldı olarak işaretlendi.");
        });
        return redirect(ctx, `/admin/talepler/${id}?ok=contact`), true;
      }
      if (action === "delete") {
        q.run("DELETE FROM requests WHERE id = ?", id);
        audit(user.id, "request_delete", r.ref);
        return redirect(ctx, "/admin/talepler?ok=deleted"), true;
      }
      throw new HttpError(400, "Bilinmeyen işlem.");
    }
    const hz = (() => { try { return JSON.parse(r.answers || "{}").__hizmet as string | undefined; } catch { return undefined; } })();
    const svc = r.service_id ? serviceById(r.service_id) : hz ? catalogService(hz) ?? null : null;
    const activity = q.all<any>("SELECT a.kind, a.body, a.created_at, u.name AS user_name FROM request_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.request_id = ? ORDER BY a.created_at DESC, a.id DESC", id);
    render(ctx, user, r.ref, <RequestDetailView r={r} csrf={csrf} statuses={statuses()} questions={svc?.questions ?? []} activity={activity} />, { active: "requests" });
    return true;
  }

  // ---------------------------------------------------------------- hizmetler
  if (p === "/admin/hizmetler" && M === "GET") {
    render(ctx, user, "Hizmetler", <ServicesView list={services()} isAdmin={isAdmin} />, { active: "services" });
    return true;
  }
  m = p.match(/^\/admin\/hizmetler\/(\d+|yeni)$/);
  if (m) {
    const isNew = m[1] === "yeni";
    if (isNew) adminOnly();
    const svc = isNew ? null : serviceById(Number(m[1]));
    if (!isNew && !svc) return false;
    if (M === "POST") {
      const f = await form(ctx, user);
      if (f.get("action") === "delete") {
        adminOnly();
        q.run("DELETE FROM services WHERE id = ?", svc!.id);
        audit(user.id, "service_delete", svc!.slug);
        return redirect(ctx, "/admin/hizmetler?ok=deleted"), true;
      }
      try {
        const id = saveService(svc, f);
        audit(user.id, isNew ? "service_create" : "service_update", String(id));
        return redirect(ctx, `/admin/hizmetler/${id}?ok=saved`), true;
      } catch (e) {
        if (!(e instanceof HttpError) || e.status !== 422) throw e;
        const keep: Record<string, string> = {};
        for (const k of ["name", "slug", "summary", "seo_title", "meta_description", "h1", "body", "questions", "pr_addons", "image_url", "image_alt", "sort", "category_id"]) keep[k] = f.get(k) ?? "";
        render(ctx, user, "Hizmet", <ServiceEditView svc={svc} cats={categories()} all={services()} csrf={csrf} isAdmin={isAdmin} error={e.message} form={keep} />, { active: "services", status: 422 });
        return true;
      }
    }
    render(ctx, user, svc?.name ?? "Yeni hizmet", <ServiceEditView svc={svc} cats={categories()} all={services()} csrf={csrf} isAdmin={isAdmin} />, { active: "services" });
    return true;
  }

  // ---------------------------------------------------------------- sayfalar
  if (p === "/admin/sayfalar" && M === "GET") {
    render(ctx, user, "Sayfalar", <PagesView list={pages()} />, { active: "pages" });
    return true;
  }
  m = p.match(/^\/admin\/sayfalar\/(\d+|yeni)$/);
  if (m) {
    const isNew = m[1] === "yeni";
    const pg = isNew ? null : q.get<any>("SELECT * FROM pages WHERE id = ?", Number(m[1]));
    if (!isNew && !pg) return false;
    if (M === "POST") {
      const f = await form(ctx, user);
      if (f.get("action") === "delete" && pg) {
        q.run("DELETE FROM pages WHERE id = ?", pg.id);
        audit(user.id, "page_delete", pg.slug);
        return redirect(ctx, "/admin/sayfalar?ok=deleted"), true;
      }
      const d = {
        title: clean(f.get("title"), 120),
        slug: clean(f.get("slug"), 80),
        seo_title: clean(f.get("seo_title"), 90),
        meta_description: clean(f.get("meta_description"), 200),
        body: clean(f.get("body"), 40000, true),
        published: f.get("published") ? 1 : 0,
        is_legal: f.get("is_legal") ? 1 : 0,
        reviewed: f.get("reviewed") ? 1 : 0,
      };
      let err = "";
      if (!d.title || !d.seo_title || !d.meta_description) err = "Başlık, SEO başlığı ve meta açıklama zorunlu.";
      else if (!SLUG.test(d.slug) || RESERVED.has(d.slug)) err = "Bu URL kullanılamaz. Küçük harf, rakam ve tire kullan; sistem adreslerini seçme.";
      else if (q.get("SELECT 1 FROM pages WHERE slug = ? AND id != ?", d.slug, pg?.id ?? 0)) err = "Bu URL başka bir sayfada kullanılıyor.";
      if (err) {
        render(ctx, user, "Sayfa", <PageEditView p={{ ...pg, ...d }} csrf={csrf} error={err} />, { active: "pages", status: 422 });
        return true;
      }
      let id = pg?.id;
      if (pg) q.run("UPDATE pages SET title=?, slug=?, seo_title=?, meta_description=?, body=?, published=?, is_legal=?, reviewed=?, updated_at=? WHERE id=?", d.title, d.slug, d.seo_title, d.meta_description, d.body, d.published, d.is_legal, d.reviewed, now(), pg.id);
      else id = Number(q.run("INSERT INTO pages (title, slug, seo_title, meta_description, body, published, is_legal, reviewed, updated_at) VALUES (?,?,?,?,?,?,?,?,?)", d.title, d.slug, d.seo_title, d.meta_description, d.body, d.published, d.is_legal, d.reviewed, now()).lastInsertRowid);
      audit(user.id, pg ? "page_update" : "page_create", d.slug);
      return redirect(ctx, `/admin/sayfalar/${id}?ok=saved`), true;
    }
    render(ctx, user, pg?.title ?? "Yeni sayfa", <PageEditView p={pg} csrf={csrf} />, { active: "pages" });
    return true;
  }

  // ---------------------------------------------------------------- durumlar
  if (p === "/admin/durumlar") {
    adminOnly();
    if (M === "POST") {
      const f = await form(ctx, user);
      const a = f.get("action");
      if (a === "save") {
        const ids = f.getAll("id"), labels = f.getAll("label"), tones = f.getAll("tone"), opens = f.getAll("is_open"), sorts = f.getAll("sort");
        const TONES = new Set(["info", "warn", "neutral", "ok", "muted"]);
        tx(() =>
          ids.forEach((id, i) => {
            const label = clean(labels[i], 40);
            if (!label) return;
            q.run("UPDATE statuses SET label = ?, tone = ?, is_open = ?, sort = ? WHERE id = ?", label, TONES.has(tones[i]) ? tones[i] : "neutral", opens[i] === "0" ? 0 : 1, Math.max(0, Math.min(99, Number(sorts[i]) || 0)), Number(id));
          }),
        );
      } else if (a === "add") {
        const label = clean(f.get("label"), 40);
        if (label) {
          const key = "s-" + Date.now().toString(36);
          const max = q.get<{ m: number }>("SELECT COALESCE(MAX(sort), 0) AS m FROM statuses")!.m;
          q.run("INSERT INTO statuses (key, label, tone, is_open, sort) VALUES (?, ?, 'neutral', 1, ?)", key, label, max + 1);
        }
      } else if (a === "delete") {
        const id = Number(f.get("id"));
        const used = q.get<{ n: number }>("SELECT COUNT(*) AS n FROM requests WHERE status_id = ?", id)!.n;
        const count = q.get<{ n: number }>("SELECT COUNT(*) AS n FROM statuses")!.n;
        if (used || count <= 1) throw new HttpError(400, "Kullanılan veya son kalan durum silinemez.");
        q.run("DELETE FROM statuses WHERE id = ?", id);
      }
      audit(user.id, "statuses_" + a);
      return redirect(ctx, "/admin/durumlar?ok=saved"), true;
    }
    const usage: Record<number, number> = {};
    for (const r of q.all<{ status_id: number; n: number }>("SELECT status_id, COUNT(*) AS n FROM requests GROUP BY status_id")) usage[r.status_id] = r.n;
    render(ctx, user, "Talep durumları", <StatusesView list={statuses()} csrf={csrf} usage={usage} />, { active: "statuses" });
    return true;
  }

  // ---------------------------------------------------------------- ayarlar
  if (p === "/admin/ayarlar") {
    adminOnly();
    if (M === "POST") {
      const f = await form(ctx, user);
      const patch: Partial<Settings> = {};
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        if (!f.has(k)) continue;
        let v = clean(f.get(k), k === "seo_default_description" ? 200 : 300);
        if (k.startsWith("color_") && !/^#[0-9a-fA-F]{6}$/.test(v)) v = DEFAULT_SETTINGS[k];
        if (k === "ga4_id" && v && !/^G-[A-Z0-9]{4,20}$/.test(v)) continue;
        if ((k.startsWith("social_") || k === "logo_url" || k === "og_image_url") && v && !/^(https:\/\/|\/(?!\/))/.test(v)) continue;
        if (k === "retention_days") v = String(Math.max(30, Math.min(3650, Number(v) || 730)));
        if (k === "brand_name" && !v) v = DEFAULT_SETTINGS.brand_name;
        patch[k] = v;
      }
      saveSettings(patch);
      audit(user.id, "settings_update");
      return redirect(ctx, "/admin/ayarlar?ok=saved"), true;
    }
    render(ctx, user, "Ayarlar", <SettingsView s={settings()} csrf={csrf} services={{ mail: mailConfigured(), turnstile: !!config.turnstileSecret, siteUrl: config.siteUrl }} />, { active: "settings" });
    return true;
  }

  // ---------------------------------------------------------------- kullanıcılar
  if (p === "/admin/kullanicilar") {
    adminOnly();
    let error = "";
    if (M === "POST") {
      const f = await form(ctx, user);
      const a = f.get("action");
      if (a === "toggle") {
        const id = Number(f.get("id"));
        if (id === user.id) throw new HttpError(400, "Kendi hesabını pasifleştiremezsin.");
        q.run("UPDATE users SET active = 1 - active WHERE id = ?", id);
        q.run("DELETE FROM sessions WHERE user_id = ?", id);
        audit(user.id, "user_toggle", String(id));
        return redirect(ctx, "/admin/kullanicilar?ok=saved"), true;
      }
      if (a === "create") {
        const email = clean(f.get("email"), 160).toLowerCase();
        const name = clean(f.get("name"), 80);
        const role = f.get("role") === "admin" ? "admin" : "editor";
        const pw = f.get("password") || "";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) error = "Ad ve geçerli bir e-posta gerekli.";
        else if (pw.length < 12) error = "Parola en az 12 karakter olmalı.";
        else if (q.get("SELECT 1 FROM users WHERE email = ?", email)) error = "Bu e-posta ile bir kullanıcı zaten var.";
        else {
          q.run("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)", email, name, await hashPassword(pw), role, now());
          audit(user.id, "user_create", email);
          return redirect(ctx, "/admin/kullanicilar?ok=created"), true;
        }
      }
    }
    const list = q.all("SELECT id, name, email, role, active, last_login_at FROM users ORDER BY created_at");
    render(ctx, user, "Kullanıcılar", <UsersView list={list} csrf={csrf} me={user.id} />, { active: "users", error, status: error ? 422 : 200 });
    return true;
  }

  if (p === "/admin/hesap") {
    let error = "";
    if (M === "POST") {
      const f = await form(ctx, user);
      const row = q.get<any>("SELECT password_hash FROM users WHERE id = ?", user.id);
      const np = f.get("password") || "";
      if (!rateLimit(ctx, "pwchange", 5, 900)) error = "Çok fazla deneme. Biraz sonra tekrar dene.";
      else if (!(await verifyPassword(f.get("current") || "", row.password_hash))) error = "Mevcut parola hatalı.";
      else if (np.length < 12) error = "Yeni parola en az 12 karakter olmalı.";
      else {
        q.run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(np), user.id);
        q.run("DELETE FROM sessions WHERE user_id = ? AND id_hash != ?", user.id, user.sessionHash);
        audit(user.id, "password_change");
        return redirect(ctx, "/admin/hesap?ok=password"), true;
      }
    }
    render(ctx, user, "Parola", <AccountView csrf={csrf} />, { error, status: error ? 422 : 200 });
    return true;
  }

  return false;
}

function safeReturn(r: string | null): string {
  return r && /^\/admin(\/[\w\-./?=&%]*)?$/.test(r) && !r.startsWith("//") ? r : "/admin";
}

// ---------------------------------------------------------------- hizmet kaydetme
function num(v: string | null, max = 100_000_000) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
}

function parseQuestions(raw: string): Question[] {
  let arr: unknown;
  try {
    arr = JSON.parse(raw || "[]");
  } catch (e) {
    throw new HttpError(422, "Sorular alanı geçerli JSON değil: " + (e as Error).message);
  }
  if (!Array.isArray(arr) || arr.length > 20) throw new HttpError(422, "Sorular bir liste olmalı (en fazla 20 soru).");
  const TYPES = new Set(["number", "select", "radio", "checkboxes", "text", "textarea"]);
  const keys = new Set<string>();
  return arr.map((x: any, i) => {
    const key = String(x?.key || "");
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw new HttpError(422, `${i + 1}. sorunun anahtarı (key) küçük harf, rakam ve _ içermeli.`);
    if (keys.has(key)) throw new HttpError(422, `"${key}" anahtarı birden fazla soruda kullanılmış.`);
    keys.add(key);
    if (!TYPES.has(x.type)) throw new HttpError(422, `"${key}" sorusunun türü geçersiz.`);
    const label = clean(x.label, 160);
    if (!label) throw new HttpError(422, `"${key}" sorusunun etiketi boş.`);
    const q: Question = { key, label, type: x.type };
    if (x.required) q.required = true;
    if (x.help) q.help = clean(x.help, 200);
    if (x.placeholder) q.placeholder = clean(x.placeholder, 100);
    if (x.type === "number") {
      if (x.min !== undefined) q.min = num(String(x.min), 1e6);
      if (x.max !== undefined) q.max = num(String(x.max), 1e6);
    }
    if (["select", "radio", "checkboxes"].includes(x.type)) {
      if (!Array.isArray(x.options) || !x.options.length || x.options.length > 20) throw new HttpError(422, `"${key}" sorusu için 1–20 seçenek gerekli.`);
      q.options = x.options.map((o: any) => {
        const value = clean(String(o?.value ?? ""), 40);
        const lab = clean(o?.label, 120);
        if (!value || !lab) throw new HttpError(422, `"${key}" sorusunda boş seçenek var.`);
        return { value, label: lab, ...(o.units !== undefined ? { units: Math.max(0, Math.min(1000, Number(o.units) || 0)) } : {}) };
      });
    }
    return q;
  });
}

function saveService(svc: ReturnType<typeof serviceById>, f: URLSearchParams): number {
  const name = clean(f.get("name"), 80);
  const slug = clean(f.get("slug"), 80);
  const catId = Number(f.get("category_id"));
  const d = {
    name,
    slug,
    h1: clean(f.get("h1"), 120),
    seo_title: clean(f.get("seo_title"), 90),
    meta_description: clean(f.get("meta_description"), 200),
    summary: clean(f.get("summary"), 160),
    body: clean(f.get("body"), 20000, true),
    image_url: clean(f.get("image_url"), 500),
    image_alt: clean(f.get("image_alt"), 200),
    published: f.get("published") ? 1 : 0,
    sort: num(f.get("sort"), 999),
  };
  if (!name || !d.h1 || !d.seo_title || !d.meta_description) throw new HttpError(422, "Ad, H1, SEO başlığı ve meta açıklama zorunlu.");
  if (!SLUG.test(slug)) throw new HttpError(422, "URL yalnızca küçük harf, rakam ve tire içerebilir.");
  if (q.get("SELECT 1 FROM services WHERE slug = ? AND id != ?", slug, svc?.id ?? 0)) throw new HttpError(422, "Bu URL başka bir hizmette kullanılıyor.");
  if (!q.get("SELECT 1 FROM categories WHERE id = ?", catId)) throw new HttpError(422, "Kategori seç.");
  if (d.image_url && !/^(https:\/\/|\/(?!\/))/.test(d.image_url)) throw new HttpError(422, "Görsel adresi https:// veya / ile başlamalı.");

  const faqQ = f.getAll("faq_q"), faqA = f.getAll("faq_a");
  const faq = faqQ.map((qq, i) => ({ q: clean(qq, 200), a: clean(faqA[i], 1000, true) })).filter((x) => x.q && x.a);
  const allSlugs = new Set(services().map((s) => s.slug));
  const related = f.getAll("related").filter((r) => allSlugs.has(r) && r !== slug).slice(0, 6);
  const questions = parseQuestions(f.get("questions") || "[]");

  let addons: PricingAddon[];
  try {
    const a = JSON.parse(f.get("pr_addons") || "[]");
    if (!Array.isArray(a)) throw new Error("liste olmalı");
    addons = a.slice(0, 20).map((x: any) => {
      const key = String(x?.key || "");
      if (!questions.some((qq) => qq.key === key)) throw new Error(`"${key}" adında bir soru yok`);
      return { key, values: (Array.isArray(x.values) ? x.values : []).map((v: unknown) => clean(String(v), 40)).filter(Boolean), amount: num(String(x.amount)), label: clean(x.label, 80) };
    });
  } catch (e) {
    throw new HttpError(422, "Fiyat ekleri geçerli değil: " + (e as Error).message);
  }
  const tn = f.getAll("tier_name"), tf = f.getAll("tier_from"), tt = f.getAll("tier_to"), ti = f.getAll("tier_inc");
  const tiers: PricingTier[] = tn
    .map((n, i) => ({ name: clean(n, 40), from: num(tf[i]), to: tt[i] ? num(tt[i]) : null, includes: clean(ti[i], 300).split(",").map((x) => x.trim()).filter(Boolean) }))
    .filter((t) => t.name);
  const unitKey = clean(f.get("pr_unitKey"), 40);
  if (unitKey && !questions.some((qq) => qq.key === unitKey)) throw new HttpError(422, "Birimi veren soru, sorular listesinde bulunmalı.");

  const pricing: Pricing = {
    enabled: !!f.get("pr_enabled"),
    verified: !!f.get("pr_verified"),
    base: num(f.get("pr_base")),
    perUnit: num(f.get("pr_perUnit")),
    unitKey,
    unitLabel: clean(f.get("pr_unitLabel"), 40),
    addons,
    tiers,
    budgetHint: clean(f.get("pr_budgetHint"), 160),
    note: clean(f.get("pr_note"), 240),
    source: clean(f.get("pr_source"), 160),
    updatedAt: svc?.pricing.updatedAt || "",
  };
  // Rakamlardan biri değiştiyse güncelleme tarihi yenilenir (ziyaretçiye gösterilen "son güncelleme")
  const fp = (p: Pricing) => JSON.stringify([p.enabled, p.verified, p.base, p.perUnit, p.unitKey, p.addons, p.tiers]);
  if (!svc || fp(svc.pricing) !== fp(pricing)) pricing.updatedAt = now().slice(0, 10);

  const ts = now();
  const J = JSON.stringify;
  if (svc) {
    q.run(
      `UPDATE services SET name=?, slug=?, category_id=?, h1=?, seo_title=?, meta_description=?, summary=?, body=?, faq=?, questions=?, pricing=?, related=?, image_url=?, image_alt=?, published=?, sort=?, updated_at=? WHERE id=?`,
      d.name, d.slug, catId, d.h1, d.seo_title, d.meta_description, d.summary, d.body, J(faq), J(questions), J(pricing), J(related), d.image_url, d.image_alt, d.published, d.sort, ts, svc.id,
    );
    return svc.id;
  }
  return Number(
    q.run(
      `INSERT INTO services (name, slug, category_id, h1, seo_title, meta_description, summary, body, faq, questions, pricing, related, image_url, image_alt, published, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      d.name, d.slug, catId, d.h1, d.seo_title, d.meta_description, d.summary, d.body, J(faq), J(questions), J(pricing), J(related), d.image_url, d.image_alt, d.published, d.sort, ts, ts,
    ).lastInsertRowid,
  );
}

// ---------------------------------------------------------------- genel bakış verisi
function overview(): Overview {
  const d = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
  const day30 = d(30).slice(0, 10);
  const total = q.get<{ n: number }>("SELECT COUNT(*) AS n FROM requests")!.n;
  const ev = (name: string) => q.get<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE name = ? AND day >= ?", name, day30)!.n;
  const svcViews = q.get<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE name = 'page_view' AND path LIKE '/hizmetler/%' AND day >= ?", day30)!.n;
  const warned = q.get<{ n: number; w: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(budget_warned), 0) AS w FROM requests WHERE budget_mode = 'amount'")!;
  const s = settings();
  const alerts: Overview["alerts"] = [];
  const unverified = services().filter((x) => x.pricing.enabled && !x.pricing.verified).length;
  if (unverified) alerts.push({ text: `${unverified} hizmetin fiyat rehberi doğrulanmadı. Rakamlar doğrulanana kadar ziyaretçiye gösterilmez.`, href: "/admin/hizmetler" });
  const draftLegal = pages().filter((x) => x.is_legal && !x.reviewed).length;
  if (draftLegal) alerts.push({ text: `${draftLegal} yasal metin taslak durumda. Yayına çıkmadan önce hukuki inceleme yapılmalı.`, href: "/admin/sayfalar" });
  if (s.brand_name === DEFAULT_SETTINGS.brand_name) alerts.push({ text: "Marka adı geçici değerde. Gerçek marka adını ve logoyu ekle.", href: "/admin/ayarlar" });
  if (!s.notify_email || !mailConfigured()) alerts.push({ text: "Yeni talep e-posta bildirimi kapalı. Talepleri kaçırmamak için bildirim e-postası ve e-posta servisi tanımla.", href: "/admin/ayarlar" });
  if (!s.contact_email) alerts.push({ text: "İletişim e-postası tanımlı değil (KVKK başvuruları için gerekli).", href: "/admin/ayarlar" });
  if (config.siteUrl.startsWith("http://localhost")) alerts.push({ text: "SITE_URL hâlâ localhost. Canonical, sitemap ve paylaşım bağlantıları için gerçek alan adını tanımla." });
  const retention = Number(s.retention_days) || 730;
  const old = q.get<{ n: number }>("SELECT COUNT(*) AS n FROM requests r JOIN statuses st ON st.id = r.status_id WHERE st.is_open = 0 AND r.updated_at < ?", d(retention))!.n;
  if (old) alerts.push({ text: `${old} kapanmış talep saklama süresini (${retention} gün) aştı. İnceleyip silmen gerekiyor.`, href: "/admin/talepler?durum=&sirala=eski" });

  return {
    total,
    last7: q.get<{ n: number }>("SELECT COUNT(*) AS n FROM requests WHERE created_at >= ?", d(7))!.n,
    last30: q.get<{ n: number }>("SELECT COUNT(*) AS n FROM requests WHERE created_at >= ?", d(30))!.n,
    byStatus: q.all("SELECT st.label, st.tone, COUNT(r.id) AS n FROM statuses st LEFT JOIN requests r ON r.status_id = st.id GROUP BY st.id ORDER BY st.sort"),
    byCategory: q.all("SELECT COALESCE(c.name, 'Başka bir hizmet') AS name, COUNT(*) AS n FROM requests r LEFT JOIN categories c ON c.slug = r.category_slug GROUP BY r.category_slug ORDER BY n DESC"),
    funnel: [
      { label: "Hizmet sayfası görüntüleme", n: svcViews },
      { label: "Formu başlatan", n: ev("form_start") },
      { label: "Bütçe uyarısı", n: ev("budget_warning") },
      { label: "Gönderilen talep", n: ev("form_submit") },
    ],
    steps: q.all("SELECT step, COUNT(*) AS n FROM events WHERE name = 'form_step' AND step IS NOT NULL AND day >= ? GROUP BY step ORDER BY step", day30),
    topPages: q.all("SELECT path, COUNT(*) AS n FROM events WHERE name = 'page_view' AND day >= ? GROUP BY path ORDER BY n DESC LIMIT 8", day30),
    bySource: q.all(
      "SELECT CASE WHEN src_source != '' THEN src_source WHEN src_referrer != '' THEN src_referrer ELSE 'Doğrudan / bilinmiyor' END AS source, COUNT(*) AS n FROM requests GROUP BY source ORDER BY n DESC LIMIT 8",
    ),
    warnedPct: warned.n ? Math.round((warned.w / warned.n) * 100) : null,
    alerts,
    recent: q.all("SELECT r.id, r.ref, r.created_at, r.service_name, r.contact_name, st.label, st.tone FROM requests r JOIN statuses st ON st.id = r.status_id ORDER BY r.created_at DESC LIMIT 5"),
  };
}
