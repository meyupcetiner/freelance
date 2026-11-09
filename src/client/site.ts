import { tierRange, tl, type PricingTier } from "../lib/pricing";
// Tüm sayfalarda çalışan küçük betik: menü, çerez tercihi, isteğe bağlı GA4, anonim ölçüm.
// Anonim ölçüm: kimlik, çerez veya serbest metin göndermez; yalnızca olay adı, yol ve kaynak türü.

const cfg = JSON.parse(document.getElementById("site-config")?.textContent || "{}") as { ga?: string; static?: boolean };
// Statik sürümde ayarlar /ayarlar.js dosyasından gelir (derleme gerekmeden düzenlenebilir)
const ayar = (window as any).SITE_AYAR || {};
if (cfg.static && ayar.ga) cfg.ga = String(ayar.ga);

// ---- Logo (ayarlar.js → logo) ----
if (typeof ayar.logo === "string" && /^(https:\/\/|\/(?!\/))/.test(ayar.logo)) {
  document.querySelectorAll<HTMLElement>(".brand, .footer-brand .wordmark").forEach((b) => {
    const img = document.createElement("img");
    img.src = ayar.logo;
    img.alt = document.querySelector<HTMLImageElement>(".wordmark-txt")?.alt || "Brif";
    img.className = "logo-img";
    img.height = 32;
    const target = b.classList.contains("brand") ? b : b;
    target.textContent = "";
    target.appendChild(img);
  });
}

// ---- Fiyat rehberi (fiyatlar.js → tüm sayfalardaki rakamlar) ----
const FR = (window as any).FIYAT_REHBERI || {};
document.querySelectorAll<HTMLElement>("[data-fiyat-tiers]").forEach((ul) => {
  const p = FR[ul.dataset.fiyatTiers || ""];
  if (!p || !Array.isArray(p.tiers)) return;
  ul.textContent = "";
  for (const t of p.tiers as PricingTier[]) {
    const li = document.createElement("li");
    for (const [cls, txt] of [["tier-name", t.name], ["tier-range", tierRange(t)], ["tier-inc", (t.includes || []).join(", ")]]) {
      const sp = document.createElement("span");
      sp.className = cls;
      sp.textContent = txt;
      li.appendChild(sp);
    }
    ul.appendChild(li);
  }
});
document.querySelectorAll<HTMLElement>("[data-fiyat-from]").forEach((sp) => {
  const p = FR[sp.dataset.fiyatFrom || ""];
  if (p) sp.textContent = tl(p.tiers?.[0]?.from || p.base || 0);
});

// ---- Kaydırınca beliren öğeler (kontrollü mikro animasyon) ----
document.documentElement.classList.add("js");
if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll<HTMLElement>(".sec-head, .svc-bento > li, .step-ed, .works2 > li, .trust2-list li, .calc").forEach((el) => {
    const i = Array.prototype.indexOf.call(el.parentElement?.children || [], el);
    el.classList.add("reveal");
    el.style.transitionDelay = (i % 4) * 70 + "ms";
    io.observe(el);
  });
}

// ---- Hizmetler mega menüsü ----
const megaBtn = document.querySelector<HTMLButtonElement>(".mega-toggle");
const mega = document.getElementById("mega");
const setMega = (open: boolean) => {
  megaBtn?.setAttribute("aria-expanded", String(open));
  mega?.classList.toggle("is-open", open);
};
megaBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  setMega(megaBtn.getAttribute("aria-expanded") !== "true");
});
document.addEventListener("click", (e) => {
  if (mega?.classList.contains("is-open") && !(e.target as HTMLElement).closest(".has-mega")) setMega(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mega?.classList.contains("is-open")) {
    setMega(false);
    megaBtn?.focus();
  }
});

// ---- Menü ----
const toggle = document.querySelector<HTMLButtonElement>(".menu-toggle");
const nav = document.getElementById("ana-menu");
toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!open));
  nav?.classList.toggle("is-open", !open);
  toggle.querySelector(".sr")!.textContent = open ? "Menüyü aç" : "Menüyü kapat";
});
nav?.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a") && toggle?.getAttribute("aria-expanded") === "true") toggle.click();
});

// ---- Kaynak (UTM) bilgisi: yalnızca bu sekme için, yalnızca kampanya parametreleri ----
try {
  const u = new URL(location.href);
  if (!sessionStorage.getItem("src")) {
    const ref = document.referrer ? new URL(document.referrer).hostname : "";
    const src = {
      source: (u.searchParams.get("utm_source") || "").slice(0, 60),
      medium: (u.searchParams.get("utm_medium") || "").slice(0, 60),
      campaign: (u.searchParams.get("utm_campaign") || "").slice(0, 80),
      referrer: ref === location.hostname ? "" : ref,
      landing: location.pathname.slice(0, 200),
    };
    sessionStorage.setItem("src", JSON.stringify(src));
  }
} catch {
  /* depolama kapalıysa kaynak bilgisi tutulmaz */
}

function sourceType(): string {
  try {
    const s = JSON.parse(sessionStorage.getItem("src") || "{}");
    if (s.source) return s.source;
    if (!s.referrer) return "direct";
    if (/google\.|bing\.|yandex\.|duckduckgo\./.test(s.referrer)) return "organic";
    if (/instagram|facebook|fb\.|t\.co|twitter|linkedin|tiktok/.test(s.referrer)) return "social";
    return "referral";
  } catch {
    return "";
  }
}

// ---- Anonim ölçüm ----
const ALLOWED = new Set(["page_view", "form_start", "form_step", "form_submit", "budget_warning"]);
function track(name: string, data: { service?: string; step?: number } = {}) {
  if (!ALLOWED.has(name)) return;
  gaEvent(name, data);
  if (cfg.static) return; // statik sürümde sunucu tarafı sayım yok
  const body = JSON.stringify({ name, path: location.pathname, service: data.service || "", step: data.step ?? null, source: sourceType() });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/olay", new Blob([body], { type: "application/json" }));
    else fetch("/api/olay", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  } catch {}
}
(window as any).__track = track;
if (!location.pathname.startsWith("/admin")) track("page_view");

// ---- Çerez tercihi + GA4 ----
const banner = document.getElementById("consent");
function getConsent(): string | null {
  const m = document.cookie.match(/(?:^|; )consent=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function setConsent(v: "allow" | "deny") {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `consent=${v}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax${secure}`;
}
let gaLoaded = false;
function loadGa() {
  if (gaLoaded || !cfg.ga || !/^G-[A-Z0-9]{4,20}$/.test(cfg.ga)) return;
  gaLoaded = true;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    w.dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", cfg.ga, { anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.ga);
  document.head.appendChild(s);
}
function gaEvent(name: string, data: { service?: string; step?: number }) {
  const w = window as any;
  if (!gaLoaded || !w.gtag || name === "page_view") return;
  w.gtag("event", name, { service: data.service || undefined, step: data.step ?? undefined });
}

// GA kimliği tanımlı değilse banner hiç gösterilmez (yalnızca zorunlu çerez var).
if (cfg.ga) {
  const c = getConsent();
  if (c === "allow") loadGa();
  else if (!c && banner) banner.hidden = false;
}
document.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-consent]");
  if (!t) return;
  const v = t.dataset.consent;
  if (v === "open") {
    if (banner) {
      banner.hidden = false;
      banner.querySelector<HTMLButtonElement>("button")?.focus();
    }
    return;
  }
  if (v === "allow" || v === "deny") {
    const prev = getConsent();
    setConsent(v);
    if (banner) banner.hidden = true;
    if (v === "allow") loadGa();
    else if (prev === "allow") location.reload(); // yüklenmiş GA'yı tamamen kaldırmak için
  }
});

