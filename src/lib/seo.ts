import { config } from "./config";
import type { Settings } from "./repo";

export interface Meta {
  title: string;
  description: string;
  /** Kanonik yol, ör. "/hizmetler/urun-fotografcisi". Sorgu parametreleri asla kanonik adrese girmez. */
  path: string;
  noindex?: boolean;
  ogType?: "website" | "article";
  jsonLd?: object[];
  breadcrumbs?: { name: string; path: string }[];
}

export const abs = (path: string) => config.siteUrl + (path.startsWith("/") ? path : "/" + path);

export function fullTitle(t: string, s: Settings) {
  return t.includes(s.brand_name) ? t : `${t} | ${s.brand_name}`;
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

export function faqLd(faq: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function organizationLd(s: Settings) {
  const sameAs = [s.social_instagram, s.social_linkedin, s.social_youtube].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s.brand_name,
    url: abs("/"),
    ...(s.logo_url ? { logo: s.logo_url.startsWith("http") ? s.logo_url : abs(s.logo_url) } : {}),
    ...(s.contact_email ? { email: s.contact_email } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** Service şeması: fiyat yalnızca yönetici doğruladıysa eklenir (doğrulanmamış veri yayımlanmaz). */
export function serviceLd(opts: { name: string; description: string; path: string; area: string; brand: string; priceFrom?: number | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: opts.name,
    description: opts.description,
    url: abs(opts.path),
    provider: { "@type": "Organization", name: opts.brand, url: abs("/") },
    ...(opts.area ? { areaServed: opts.area } : {}),
    ...(opts.priceFrom
      ? { offers: { "@type": "Offer", priceCurrency: "TRY", priceSpecification: { "@type": "PriceSpecification", minPrice: opts.priceFrom, priceCurrency: "TRY" } } }
      : {}),
  };
}

/** JSON'u <script> içine güvenle yerleştirir (</script> kaçışı). */
export const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, " ");
