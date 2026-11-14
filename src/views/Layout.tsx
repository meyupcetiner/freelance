import type { ReactNode } from "react";
import type { Settings, Category } from "../lib/repo";
import { abs, fullTitle, safeJson, breadcrumbLd, type Meta } from "../lib/seo";
import { asset } from "../lib/assets";
import { CATEGORIES, SERVICES } from "../data/catalog";
import { HUBS } from "../data/hubs";
import { Icon } from "./components/icons";

const HEX = /^#[0-9a-fA-F]{6}$/;
const col = (v: string, fb: string) => (HEX.test(v) ? v : fb);

export function themeCss(s: Settings) {
  return `:root{--brand:${col(s.color_primary, "#191919")};--brand-2:${col(s.color_primary_2, "#2F5FD6")};--sky:${col(s.color_sky, "#77EA2F")};--signal:${col(s.color_signal, "#77EA2F")}}`;
}

export function Logo({ s }: { s: Settings }) {
  if (s.logo_url) return <img src={s.logo_url} alt={s.brand_name} className="logo-img" height={32} />;
  return (
    <span className="wordmark">
      <svg viewBox="0 0 34 34" width="30" height="30" aria-hidden="true" className="mark">
        <rect width="34" height="34" rx="7.5" fill="#77EA2F" />
        <circle cx="25.3" cy="9.2" r="5.7" fill="#100404" />
      </svg>
      <img className="wordmark-txt" src="/assets/logo-yazi.png" alt={s.brand_name} width={44} height={21} />
    </span>
  );
}

/** Üst menü sekme ikonları (Lucide çizgi stili, ISC lisansı) */
export function SegIcon({ k, size = 18 }: { k: string; size?: number }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {k === "studyo" ? (
        <g {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></g>
      ) : k === "tasarim" ? (
        <g {...p}><path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="m2 2 7.586 7.586" /><circle cx="11" cy="11" r="2" /></g>
      ) : (
        <g {...p}><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></g>
      )}
    </svg>
  );
}

interface LayoutProps {
  meta: Meta;
  s: Settings;
  cats: Category[];
  children: ReactNode;
  /** Sayfa sonuna eklenecek modüller (ör. "talep") */
  scripts?: string[];
  bodyClass?: string;
}

export function Layout({ meta, s, cats, children, scripts = [], bodyClass }: LayoutProps) {
  const title = fullTitle(meta.title, s);
  const canonical = abs(meta.path);
  const ld = [...(meta.jsonLd || [])];
  if (meta.breadcrumbs?.length) ld.push(breadcrumbLd(meta.breadcrumbs));
  const og = s.og_image_url ? (s.og_image_url.startsWith("http") ? s.og_image_url : abs(s.og_image_url)) : abs("/og-default.png");
  return (
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={canonical} />
        {meta.noindex ? <meta name="robots" content="noindex, follow" /> : null}
        {s.gsc_verification ? <meta name="google-site-verification" content={s.gsc_verification} /> : null}
        <meta property="og:type" content={meta.ogType || "website"} />
        <meta property="og:locale" content="tr_TR" />
        <meta property="og:site_name" content={s.brand_name} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={og} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" content="#FFFFFF" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preload" href="/assets/fonts/InstrumentSans.woff" as="font" type="font/woff" crossOrigin="" />
        <link rel="preload" href="/assets/fonts/Geist.woff" as="font" type="font/woff" crossOrigin="" />
        <link rel="stylesheet" href={asset("/assets/fonts/brand.css")} />
        <link rel="stylesheet" href={asset("/styles.css")} />
        <style dangerouslySetInnerHTML={{ __html: themeCss(s) }} />
        {ld.map((o, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(o) }} />
        ))}
      </head>
      <body className={bodyClass}>
        <a className="skip" href="#icerik">
          İçeriğe geç
        </a>
        <header className="site-header">
          <div className="wrap header-row">
            <a href="/ana-sayfa" className="brand" aria-label={`${s.brand_name} ana sayfa`}>
              <Logo s={s} />
            </a>
            <nav aria-label="Ana menü" className="main-nav" id="ana-menu">
              <ul>
                <li className="has-mega">
                  <a href="/hizmetler" className="mega-toggle" aria-haspopup="true">
                    Hizmetler
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </a>
                  <div className="mega" id="mega">
                    <ul className="mega-grid">
                      {CATEGORIES.map((c) => (
                        <li key={c.slug}>
                          <a className="mega-card" href={`/talep-olustur?kategori=${c.slug}`}>
                            <span className="mega-ico"><Icon name={c.icon} size={22} /></span>
                            <span className="mega-txt">
                              <span className="mega-name">{c.name}</span>
                              <span className="mega-short">{c.short}</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    <div className="mega-foot">
                      <a href="/hizmetler" className="text-link">Tüm hizmetleri gör ({SERVICES.length})</a>
                      <a href="/talep-olustur" className="btn btn-primary btn-sm">Talep oluştur</a>
                    </div>
                  </div>
                </li>
                <li><a href="/nasil-calisir">Nasıl çalışır</a></li>
                <li><a href="/fiyat-rehberi">Fiyatlar</a></li>
                <li><a href="/blog">Blog</a></li>
                <li className="nav-cta"><a href="/talep-olustur" className="btn btn-primary btn-block">Projen için talep oluştur</a></li>
              </ul>
            </nav>
            <nav className="seg" aria-label="Brif alanları">
              {HUBS.map((h) => (
                <a key={h.key} href={h.path} className={"seg-i" + (meta.path === h.path ? " is-on" : "")} {...(meta.path === h.path ? { "aria-current": "page" as const } : {})} title={`${h.ad} · ${h.alt}`}>
                  <span className="seg-ico"><SegIcon k={h.key} /></span>
                  <span>{h.sekme}</span>
                </a>
              ))}
            </nav>
            <a href="/talep-olustur" className="btn btn-primary btn-sm header-cta">
              Talep oluştur
            </a>
            <button className="menu-toggle" type="button" aria-expanded="false" aria-controls="ana-menu">
              <span className="sr">Menüyü aç</span>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </header>
        <main id="icerik">{children}</main>
        <Footer s={s} cats={cats} />
        <div className="consent" id="consent" hidden role="dialog" aria-labelledby="consent-title" aria-live="polite">
          <div className="consent-box">
            <p id="consent-title" className="consent-title">Çerez tercihi</p>
            <p>
              Siteyi geliştirmek için Google Analytics kullanmak istiyoruz. Onay vermezsen yalnızca zorunlu çerezler kullanılır.{" "}
              <a href="/cerez-politikasi">Çerez politikası</a>
            </p>
            <div className="consent-actions">
              <button type="button" className="btn btn-ghost btn-sm" data-consent="deny">Reddet</button>
              <button type="button" className="btn btn-primary btn-sm" data-consent="allow">Kabul et</button>
            </div>
          </div>
        </div>
        <script id="site-config" type="application/json" dangerouslySetInnerHTML={{ __html: safeJson({ ga: s.ga4_id || "", static: !!process.env.STATIC_EXPORT }) }} />
        {process.env.STATIC_EXPORT ? (
          <>
            <script src="/ayarlar.js" />
            <script src="/fiyatlar.js" />
          </>
        ) : null}
        <script type="module" src={asset("/assets/site.js")} />
        {scripts.map((m) => (
          <script key={m} type="module" src={asset(`/assets/${m}.js`)} />
        ))}
      </body>
    </html>
  );
}

function Footer({ s, cats }: { s: Settings; cats: Category[] }) {
  const year = new Date().getFullYear();
  const socials = [
    ["Instagram", s.social_instagram],
    ["LinkedIn", s.social_linkedin],
    ["YouTube", s.social_youtube],
  ].filter(([, u]) => u);
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Logo s={s} />
          <p>{s.brand_tagline}</p>
          <a href="/talep-olustur" className="btn btn-primary btn-sm">Talep oluştur</a>
        </div>
        <nav aria-label="Hizmet kategorileri">
          <p className="footer-h">Hizmetler</p>
          <ul>
            {CATEGORIES.map((c) => (
              <li key={c.slug}><a href={`/talep-olustur?kategori=${c.slug}`}>{c.name}</a></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Platform">
          <p className="footer-h">Platform</p>
          <ul>
            <li><a href="/ana-sayfa">Ana sayfa</a></li>
            {HUBS.map((h) => <li key={h.key}><a href={h.path}>{h.ad}</a></li>)}
            <li><a href="/blog">Blog</a></li>
            <li><a href="/hakkimizda">Hakkımızda</a></li>
            <li><a href="/nasil-calisir">Nasıl çalışır?</a></li>
            <li><a href="/fiyat-rehberi">Fiyat rehberi</a></li>
            <li><a href="/sss">Sık sorulan sorular</a></li>
          </ul>
        </nav>
        <div>
          <p className="footer-h">İletişim</p>
          <ul>
            {s.contact_email ? <li><a href={`mailto:${s.contact_email}`}>{s.contact_email}</a></li> : null}
            {s.contact_phone ? <li><a href={`tel:${s.contact_phone.replace(/\s/g, "")}`}>{s.contact_phone}</a></li> : null}
            {socials.map(([n, u]) => (
              <li key={n}><a href={u} rel="noopener me" target="_blank">{n}</a></li>
            ))}
            {!s.contact_email && !s.contact_phone ? <li><a href="/talep-olustur">Talep formu üzerinden yaz</a></li> : null}
          </ul>
        </div>
      </div>
      <div className="wrap footer-legal">
        <p>© {year} {s.legal_entity || s.brand_name}</p>
        <ul>
          <li><a href="/kvkk-aydinlatma-metni">KVKK aydınlatma metni</a></li>
          <li><a href="/gizlilik-politikasi">Gizlilik</a></li>
          <li><a href="/kullanim-kosullari">Kullanım koşulları</a></li>
          <li><a href="/cerez-politikasi">Çerez politikası</a></li>
          <li><button type="button" className="linklike" data-consent="open">Çerez tercihleri</button></li>
        </ul>
      </div>
    </footer>
  );
}
