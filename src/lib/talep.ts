// Talep doğrulama — hem Cloudflare Worker'da hem Node sunucusunda kullanılan saf (bağımlılıksız) modül.
import { CATEGORIES, PREFS, SERVICES, TIMINGS, categoryBySlug, serviceBySlug } from "../data/catalog";
import { estimate, isBudgetLow, type Answers, type Pricing, type Question } from "./pricing";

export function clean(v: unknown, max: number, multiline = false): string {
  if (typeof v !== "string") return "";
  let s = v.normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮]/g, "");
  s = multiline ? s.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max);
}

export interface TalepKaydi {
  idem: string;
  kategori: string;
  kategori_ad: string;
  hizmet: string;
  hizmet_ad: string;
  cevaplar: Answers;
  aciklama: string;
  butce_tur: "tutar" | "teklif";
  butce: number | null;
  rehber_min: number | null;
  butce_dusuk: boolean;
  zaman: string;
  zaman_tarih: string | null;
  ad: string;
  telefon: string;
  eposta: string;
  tercih: string;
  firma: string;
  iletisim_izni: boolean;
  kaynak: { source: string; medium: string; campaign: string; referrer: string; landing: string };
}

export type Sonuc = { ok: true; kayit: TalepKaydi } | { ok: false; fields: Record<string, string>; message: string };

function cleanAnswers(questions: Question[], raw: unknown, fields: Record<string, string>): Answers {
  const out: Answers = {};
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const q of questions) {
    const a = src[q.key];
    if (q.type === "checkboxes") {
      const allowed = new Set(q.options?.map((o) => o.value));
      const vals = Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && allowed.has(x)) : [];
      if (vals.length) out[q.key] = [...new Set(vals)];
    } else if (q.type === "radio" || q.type === "select") {
      if (typeof a === "string" && q.options?.some((o) => o.value === a)) out[q.key] = a;
    } else if (q.type === "number") {
      if (a !== undefined && a !== "" && a !== null) {
        const n = Number(a);
        if (!Number.isInteger(n) || n < (q.min ?? 0) || (q.max !== undefined && n > q.max)) fields["q_" + q.key] = `${q.min ?? 0} ile ${q.max ?? "∞"} arasında bir sayı gir.`;
        else out[q.key] = String(n);
      }
    } else {
      const s = clean(a, q.type === "textarea" ? 1000 : 200, q.type === "textarea");
      if (s) out[q.key] = s;
    }
    if (q.required && out[q.key] === undefined && !fields["q_" + q.key]) fields["q_" + q.key] = "Bu soruyu yanıtla.";
  }
  return out;
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** Gelen gövdeyi doğrular ve temiz bir kayda dönüştürür. pricingFor: hizmetin fiyat kuralı (varsa). */
export function validateTalep(body: any, pricingFor: (priceRef: string) => Pricing | null = () => null): Sonuc {
  const fields: Record<string, string> = {};
  const kat = categoryBySlug(clean(body?.kategori, 40));
  const svc = serviceBySlug(clean(body?.hizmet, 80));
  if (!kat) fields.kategori = "Bir ana kategori seç.";
  else if (!svc || svc.category !== kat.slug) fields.hizmet = "Bu kategoriden bir hizmet seç.";
  const questions = svc?.questions ?? [];
  const cevaplar = svc ? cleanAnswers(questions, body?.cevaplar, fields) : {};
  const aciklama = clean(body?.aciklama, 3000, true);

  const butce_tur = body?.butce_tur === "teklif" ? "teklif" : "tutar";
  let butce: number | null = null;
  if (butce_tur === "tutar") {
    const b = Number(body?.butce);
    if (!Number.isInteger(b) || b <= 0 || b > 100_000_000) fields.butce = "Geçerli bir tutar gir ya da teklif almak istediğini seç.";
    else butce = b;
  }

  const zaman = String(body?.zaman || "");
  if (!TIMINGS.some((t) => t.value === zaman)) fields.zaman = "Bir zamanlama seç.";
  let zaman_tarih: string | null = null;
  if (zaman === "belirli-tarih") {
    const d = String(body?.zaman_tarih || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) fields.zaman_tarih = "Geçerli bir tarih seç.";
    else zaman_tarih = d;
  }

  const ad = clean(body?.ad, 80);
  if (ad.length < 3 || !/\s/.test(ad)) fields.ad = "Adını ve soyadını yaz.";
  const telDigits = String(body?.telefon || "").replace(/\D/g, "");
  const telefon = clean(body?.telefon, 20);
  if (telDigits.length < 10 || telDigits.length > 13) fields.telefon = "Telefon numarasını alan koduyla gir (ör. 0532 123 45 67).";
  const eposta = clean(body?.eposta, 160).toLowerCase();
  if (!EMAIL_RE.test(eposta)) fields.eposta = "Geçerli bir e-posta adresi gir.";
  const tercih = PREFS.some((p) => p.value === body?.tercih) ? String(body.tercih) : "telefon";
  if (body?.kvkk !== true) fields.kvkk = "Devam etmek için aydınlatma metnini okuduğunu onayla.";
  const firma = clean(body?.firma, 120);
  const idem = clean(body?.idem, 64).replace(/[^\w-]/g, "");
  if (idem.length < 16) fields.idem = "Form oturumu geçersiz. Sayfayı yenileyip tekrar dene.";

  if (Object.keys(fields).length) return { ok: false, fields, message: "Bazı alanları kontrol etmen gerekiyor." };

  const pricing = svc!.priceRef ? pricingFor(svc!.priceRef) : null;
  const est = estimate(questions, pricing, cevaplar);
  const src = body?.kaynak && typeof body.kaynak === "object" ? body.kaynak : {};
  return {
    ok: true,
    kayit: {
      idem,
      kategori: kat!.slug,
      kategori_ad: kat!.name,
      hizmet: svc!.slug,
      hizmet_ad: svc!.name,
      cevaplar,
      aciklama,
      butce_tur,
      butce,
      rehber_min: est.min,
      butce_dusuk: isBudgetLow(est, butce),
      zaman,
      zaman_tarih,
      ad,
      telefon,
      eposta,
      tercih,
      firma,
      iletisim_izni: body?.iletisim_izni === true,
      kaynak: {
        source: clean(src.source, 60),
        medium: clean(src.medium, 60),
        campaign: clean(src.campaign, 80),
        referrer: clean(src.referrer, 120).replace(/[^a-z0-9.-]/gi, ""),
        landing: clean(src.landing, 200).split("?")[0],
      },
    },
  };
}

/** Admin panelinde cevapları okunur etiketlere çevirir */
export function answerRows(hizmet: string, cevaplar: Answers): { label: string; value: string }[] {
  const svc = serviceBySlug(hizmet);
  if (!svc) return Object.entries(cevaplar).map(([k, v]) => ({ label: k, value: Array.isArray(v) ? v.join(", ") : v }));
  return svc.questions
    .filter((q) => cevaplar[q.key] !== undefined)
    .map((q) => {
      const v = cevaplar[q.key];
      const vals = Array.isArray(v) ? v : [v];
      return { label: q.label, value: vals.map((x) => q.options?.find((o) => o.value === x)?.label ?? x).join(", ") };
    });
}

export const FILE_RULES = {
  maxFiles: 3,
  maxBytes: 1_500_000,
  types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

export { CATEGORIES, SERVICES };
