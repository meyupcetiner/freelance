// HTTP sunucusu ve yönlendirme. Tüm sayfalar sunucuda render edilir (arama motorları tam HTML görür).
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import type { ReactElement } from "react";
import { config } from "./lib/config";
import { migrate } from "./lib/db";
import { seed } from "./lib/bootstrap";
import { applySecurityHeaders, clientIp, HttpError, json, parseCookies, readJson, redirect, send, assertSameOrigin, type Ctx } from "./lib/http";
import { housekeeping, rateLimit } from "./lib/security";
import { categories, pageBySlug, pages, publicServiceConfig, serviceBySlug, services, settings } from "./lib/repo";
import { createRequest, recordEvent, ValidationError } from "./lib/requests";
import { abs, faqLd, organizationLd, safeJson, serviceLd, type Meta } from "./lib/seo";
import { plain } from "./lib/markdown";
import { PUBLIC_DIR } from "./lib/assets";
import { Layout } from "./views/Layout";
import { BlogShell, CmsPage, FaqPage, Home, HowPage, HubPage, NotFound, PriceGuidePage, RequestShell, ServicePage, ServicesPage } from "./views/pages/public";
import { HUBS } from "./data/hubs";

// Alan sayfalarında gösterilen blog rehberleri (Worker'daki yazılarla aynı adresler)
const HUB_POSTS: Record<string, { href: string; baslik: string }[]> = {
  studyo: [
    { href: "/blog/urun-fotografi-fiyatlari", baslik: "Ürün fotoğrafı fiyatları neye göre belirlenir?" },
    { href: "/blog/e-ticaret-urun-fotografi-rehberi", baslik: "E-ticaret ürün fotoğrafı: çekimden önce hazırlık listesi" },
    { href: "/blog/tanitim-filmi-cekimi-fiyati", baslik: "Tanıtım filmi çekimi fiyatı ve süreci" },
  ],
  tasarim: [{ href: "/blog/kurumsal-kimlik-tasarimi-sureci", baslik: "Kurumsal kimlik tasarımı süreci: neler teslim edilir?" }],
  dijital: [{ href: "/blog/meta-reklam-yonetimi-ucreti", baslik: "Meta reklam yönetimi ücreti neye göre belirlenir?" }],
};
import { RequestForm, type FormProps } from "./views/components/RequestForm";
import { CATEGORIES, SERVICES, PAGE_TO_SERVICE } from "./data/catalog";

/** Talep formunun props'u: katalog + (varsa) hizmet sayfalarındaki fiyat kuralları */
export function formProps(staticMode: boolean): FormProps & { pageMap: Record<string, string>; priceRefs: Record<string, string> } {
  const priced = new Map(services({ publishedOnly: true }).filter((x) => x.pricing.enabled).map((x) => [x.slug, { ...x.pricing, verified: true }]));
  const priceRefs: Record<string, string> = {};
  for (const x of SERVICES) if (x.priceRef) priceRefs[x.slug] = x.priceRef;
  return {
    categories: CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, short: c.short, icon: c.icon })),
    services: SERVICES.map((x) => ({ slug: x.slug, name: x.name, category: x.category, questions: x.questions, pricing: (x.priceRef && priced.get(x.priceRef)) || null })),
    allowFiles: staticMode,
    staticMode,
    pageMap: PAGE_TO_SERVICE,
    priceRefs,
  };
}
import { generalFaq } from "./data/general-faq";
import { handleAdmin } from "./admin/routes";

migrate();
const seeded = seed();
if (seeded.length) console.log("Başlangıç verisi yazıldı:", seeded.join(", "));
housekeeping();
setInterval(housekeeping, 6 * 3600 * 1000).unref();

export function renderPage(ctx: Ctx, meta: Meta, body: ReactElement, opts: { status?: number; scripts?: string[]; bodyClass?: string } = {}) {
  const s = settings();
  const html = "<!doctype html>" + renderToStaticMarkup(<Layout meta={meta} s={s} cats={categories()} scripts={opts.scripts} bodyClass={opts.bodyClass}>{body}</Layout>);
  send(ctx, opts.status ?? 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-cache" });
}

function notFound(ctx: Ctx) {
  renderPage(ctx, { title: "Sayfa bulunamadı", description: "Aradığın sayfa bulunamadı.", path: ctx.url.pathname, noindex: true }, <NotFound services={services({ publishedOnly: true })} />, { status: 404 });
}

// ------------------------------------------------------------------ statik dosyalar
const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function tryStatic(ctx: Ctx): boolean {
  const p = ctx.url.pathname;
  if (!/^\/(assets|fonts|uploads)\/|^\/(styles\.css|favicon\.svg|og-default\.png)$/.test(p)) return false;
  const file = normalize(join(PUBLIC_DIR, decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC_DIR)) return false; // dizin dışına çıkma girişimi
  let st;
  try {
    st = statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const ext = extname(file);
  if (ext === ".map" && config.isProd) return false;
  ctx.res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  ctx.res.setHeader("Content-Length", st.size);
  ctx.res.setHeader("Cache-Control", ctx.url.searchParams.has("v") || p.startsWith("/fonts/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  createReadStream(file).pipe(ctx.res);
  return true;
}

// ------------------------------------------------------------------ genel sayfalar
async function handlePublic(ctx: Ctx): Promise<boolean> {
  const p = ctx.url.pathname;
  const s = settings();

  if (ctx.method === "POST" && p === "/api/talep") {
    assertSameOrigin(ctx);
    if (!rateLimit(ctx, "talep", 10, 3600)) return json(ctx, 429, { error: "Kısa sürede çok fazla talep gönderildi. Lütfen bir süre sonra tekrar dene." }), true;
    const body = await readJson(ctx);
    try {
      const r = await createRequest(body, ctx.ip);
      json(ctx, 201, { ok: true, ref: r.ref });
    } catch (e) {
      if (e instanceof ValidationError) json(ctx, 422, { error: e.message, fields: e.fields });
      else throw e;
    }
    return true;
  }
  if (ctx.method === "POST" && p === "/api/olay") {
    // sendBeacon Origin gönderir; farklı kaynaktan gelenler yok sayılır
    try {
      assertSameOrigin(ctx);
    } catch {
      return send(ctx, 204, ""), true;
    }
    if (rateLimit(ctx, "olay", 120, 600)) {
      const ct = String(ctx.req.headers["content-type"] || "");
      if (ct.startsWith("application/json")) recordEvent(await readJson(ctx).catch(() => null));
    }
    send(ctx, 204, "");
    return true;
  }
  if (ctx.method !== "GET" && ctx.method !== "HEAD") return false;

  if (p === "/robots.txt") {
    send(ctx, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${abs("/sitemap.xml")}\n`, "text/plain; charset=utf-8");
    return true;
  }
  if (p === "/sitemap.xml") {
    const svcs = services({ publishedOnly: true });
    const urls: [string, string][] = [
      ["/", ""],
      ["/tasarim", ""],
      ["/dijital", ""],
      ["/ana-sayfa", ""],
      ["/hizmetler", ""],
      ["/talep-olustur", ""],
      ["/nasil-calisir", ""],
      ["/fiyat-rehberi", ""],
      ["/sss", ""],
      ...svcs.map((x) => [`/hizmetler/${x.slug}`, x.updated_at] as [string, string]),
      ...pages().filter((x) => x.published).map((x) => ["/" + x.slug, x.updated_at] as [string, string]),
    ];
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map(([u, m]) => `  <url><loc>${abs(u)}</loc>${m ? `<lastmod>${m.slice(0, 10)}</lastmod>` : ""}</url>`).join("\n") +
      `\n</urlset>\n`;
    send(ctx, 200, xml, "application/xml; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
    return true;
  }
  const hub = HUBS.find((h) => h.path === p);
  if (hub) {
    renderPage(
      ctx,
      {
        title: hub.title,
        description: hub.description,
        path: p,
        jsonLd: [
          ...(p === "/" ? [organizationLd(s), { "@context": "https://schema.org", "@type": "WebSite", name: s.brand_name, url: abs("/") }] : []),
          serviceLd({ name: hub.ad, description: hub.cevap, path: p, area: s.service_area || "İstanbul", brand: s.brand_name }),
          faqLd(hub.sss),
        ],
        breadcrumbs: p === "/" ? undefined : [{ name: "Ana sayfa", path: "/" }, { name: hub.ad, path: p }],
      },
      <HubPage hub={hub} posts={HUB_POSTS[hub.key] || []} />,
      { bodyClass: "page-hub hub-" + hub.key },
    );
    return true;
  }
  if (p === "/ana-sayfa") {
    const svcs = services({ publishedOnly: true });
    renderPage(ctx, { title: "Brif – Fotoğraf, Tasarım ve Dijital Hizmetler", description: s.seo_default_description, path: p, jsonLd: [faqLd(generalFaq.slice(0, 5))] }, <Home s={s} cats={categories()} services={svcs} />, { scripts: ["home"], bodyClass: "page-home" });
    return true;
  }
  if (p === "/blog-sablon") {
    renderPage(ctx, { title: "__BLOG_TITLE__", description: "__BLOG_DESC__", path: "/__BLOG_PATH__", noindex: true, ogType: "article" }, <BlogShell />, { bodyClass: "page-blog" });
    return true;
  }
  if (p === "/hizmetler") {
    const svcs = services({ publishedOnly: true });
    renderPage(ctx, { title: "Hizmetler: fotoğraf, video, sosyal medya ve reklam", description: "Ürün fotoğrafçılığı, etkinlik çekimi, Reels, video kurgu, sosyal medya yönetimi ve Meta reklam yönetimi hizmetleri.", path: "/hizmetler", breadcrumbs: [{ name: "Ana sayfa", path: "/" }, { name: "Hizmetler", path: "/hizmetler" }] }, <ServicesPage cats={categories()} services={svcs} />);
    return true;
  }
  const m = p.match(/^\/hizmetler\/([a-z0-9-]+)$/);
  if (m) {
    const svc = serviceBySlug(m[1]);
    if (!svc) return false;
    const all = services({ publishedOnly: true });
    const related = svc.related.map((r) => all.find((x) => x.slug === r)).filter(Boolean) as typeof all;
    const path = `/hizmetler/${svc.slug}`;
    const priceFrom = svc.pricing.enabled && svc.pricing.verified ? svc.pricing.tiers[0]?.from || svc.pricing.base : null;
    renderPage(
      ctx,
      {
        title: svc.seo_title,
        description: svc.meta_description,
        path,
        ogType: "article",
        breadcrumbs: [{ name: "Ana sayfa", path: "/" }, { name: "Hizmetler", path: "/hizmetler" }, { name: svc.name, path }],
        jsonLd: [serviceLd({ name: svc.name, description: plain(svc.meta_description), path, area: s.service_area, brand: s.brand_name, priceFrom }), ...(svc.faq.length ? [faqLd(svc.faq)] : [])],
      },
      <ServicePage s={s} svc={svc} related={related} />,
    );
    return true;
  }
  if (p === "/talep-olustur") {
    const props = formProps(!!process.env.STATIC_EXPORT);
    const want = (ctx.url.searchParams.get("hizmet") || "").slice(0, 80);
    const mapped = PAGE_TO_SERVICE[want] || want;
    if (!process.env.STATIC_EXPORT && props.services.some((x) => x.slug === mapped)) props.initialService = mapped;
    const island = renderToString(<RequestForm {...props} />);
    renderPage(
      ctx,
      { title: "Talep oluştur", description: "Fotoğraf, video, tasarım, web, reklam, sosyal medya veya içerik işin için ücretsiz talep oluştur. Kategori ve hizmeti seç, birkaç soruyu yanıtla, kapsamına uygun dönüş al.", path: "/talep-olustur" },
      <>
        <RequestShell islandHtml={island} s={s} />
        <script id="talep-props" type="application/json" dangerouslySetInnerHTML={{ __html: safeJson(props) }} />
      </>,
      { scripts: ["talep"], bodyClass: "page-req" },
    );
    return true;
  }
  if (p === "/nasil-calisir") {
    renderPage(ctx, { title: "Nasıl çalışır?", description: "Talep formundan teklife kadar süreç nasıl işliyor? Bugün talepler nasıl değerlendiriliyor, ileride neler değişecek?", path: p, breadcrumbs: [{ name: "Ana sayfa", path: "/" }, { name: "Nasıl çalışır?", path: p }] }, <HowPage />);
    return true;
  }
  if (p === "/fiyat-rehberi") {
    renderPage(ctx, { title: "Fiyat rehberi: fotoğraf, video ve reklam hizmetlerinde fiyatı ne belirler?", description: "Ürün çekimi, etkinlik fotoğrafı, Reels, video kurgu, sosyal medya ve Meta reklam yönetiminde fiyatı etkileyen unsurlar ve rehber aralıklar.", path: p, breadcrumbs: [{ name: "Ana sayfa", path: "/" }, { name: "Fiyat rehberi", path: p }] }, <PriceGuidePage services={services({ publishedOnly: true })} />, { scripts: ["home"] });
    return true;
  }
  if (p === "/sss") {
    renderPage(ctx, { title: "Sık sorulan sorular", description: "Talep oluşturma, fiyatlandırma, dönüş süresi ve kişisel verilerle ilgili sık sorulan sorular.", path: p, breadcrumbs: [{ name: "Ana sayfa", path: "/" }, { name: "Sık sorulan sorular", path: p }], jsonLd: [faqLd(generalFaq)] }, <FaqPage />);
    return true;
  }
  const cms = p.match(/^\/([a-z0-9-]+)$/);
  if (cms) {
    const page = pageBySlug(cms[1]);
    if (!page) return false;
    renderPage(ctx, { title: page.seo_title, description: page.meta_description, path: p, breadcrumbs: [{ name: "Ana sayfa", path: "/" }, { name: page.title, path: p }] }, <CmsPage page={page} />);
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ sunucu
const server = createServer(async (req, res) => {
  const started = Date.now();
  applySecurityHeaders(res);
  let url: URL;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    res.statusCode = 400;
    return res.end("Geçersiz adres");
  }
  const ctx: Ctx = { req, res, url, method: req.method || "GET", params: {}, ip: clientIp(req), cookies: parseCookies(req.headers.cookie) };
  try {
    // Kalıcı ve tek biçimli URL'ler: sondaki /, büyük harf ve // kaldırılır
    const p = url.pathname;
    if (tryStatic(ctx)) return;
    if (ctx.method === "GET" && p !== "/" && (p.endsWith("/") || /[A-Z]/.test(p) || p.includes("//"))) {
      const clean = p.replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase() || "/";
      return redirect(ctx, clean + url.search, 301);
    }
    if (p === "/admin" || p.startsWith("/admin/")) {
      if (await handleAdmin(ctx)) return;
      return notFound(ctx);
    }
    if (await handlePublic(ctx)) return;
    notFound(ctx);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(`[hata] ${ctx.method} ${url.pathname}`, e);
    if (res.headersSent) return res.end();
    const msg = e instanceof HttpError ? e.message : "Beklenmeyen bir hata oluştu.";
    if (url.pathname.startsWith("/api/") || String(req.headers.accept || "").includes("application/json")) return json(ctx, status, { error: msg });
    if (status === 401 && url.pathname.startsWith("/admin")) return redirect(ctx, "/admin/giris?r=" + encodeURIComponent(url.pathname + url.search));
    renderPage(ctx, { title: "Bir sorun oluştu", description: msg, path: url.pathname, noindex: true }, <section className="section"><div className="wrap narrow"><h1>Bir sorun oluştu</h1><p className="lead">{msg}</p><p><a className="btn btn-primary" href="/">Ana sayfaya dön</a></p></div></section>, { status });
  } finally {
    if (!config.isProd) res.on("finish", () => console.log(`${ctx.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`));
  }
});

server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.listen(config.port, () => console.log(`Sunucu hazır: http://localhost:${config.port}  (SITE_URL=${config.siteUrl})`));
