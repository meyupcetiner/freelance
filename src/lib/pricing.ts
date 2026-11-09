// Hem sunucuda hem tarayıcıda çalışan, bağımlılıksız fiyat rehberi mantığı.
// Her hizmetin kendi kuralı vardır; tek bir genel "düşük bütçe" eşiği yoktur.

export type QuestionType = "number" | "select" | "radio" | "checkboxes" | "text" | "textarea";

export interface QuestionOption {
  value: string;
  label: string;
  /** Fiyat birimine katkı (ör. "4 saat" seçeneği için 4). */
  units?: number;
}

export interface Question {
  key: string;
  label: string;
  type: QuestionType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: QuestionOption[];
}

export interface PricingAddon {
  /** Hangi soru */
  key: string;
  /** Bu cevap(lar)dan biri seçiliyse eklenir */
  values: string[];
  amount: number;
  label: string;
}

export interface PricingTier {
  name: string;
  from: number;
  to: number | null;
  includes: string[];
}

export interface Pricing {
  enabled: boolean;
  /** Yönetici rakamları doğruladı mı? Doğrulanmamış rakamlar ziyaretçiye gösterilmez. */
  verified: boolean;
  base: number;
  perUnit: number;
  /** Birim sayısını veren soru anahtarı */
  unitKey: string;
  unitLabel: string;
  addons: PricingAddon[];
  tiers: PricingTier[];
  /** Bütçe sorusunun yanında görünen açıklama (ör. "reklam harcaması hariç") */
  budgetHint: string;
  note: string;
  source: string;
  updatedAt: string;
}

export const emptyPricing = (): Pricing => ({
  enabled: false,
  verified: false,
  base: 0,
  perUnit: 0,
  unitKey: "",
  unitLabel: "",
  addons: [],
  tiers: [],
  budgetHint: "",
  note: "",
  source: "",
  updatedAt: "",
});

export type Answers = Record<string, string | string[]>;

export function unitsFrom(questions: Question[], pricing: Pricing, answers: Answers): number {
  if (!pricing.unitKey) return 0;
  const q = questions.find((x) => x.key === pricing.unitKey);
  const a = answers[pricing.unitKey];
  if (!q || a === undefined || a === "") return 0;
  if (q.type === "number") {
    const n = Number(a);
    return Number.isFinite(n) && n > 0 ? Math.min(n, q.max ?? 10000) : 0;
  }
  const vals = Array.isArray(a) ? a : [a];
  return vals.reduce((s, v) => s + (q.options?.find((o) => o.value === v)?.units ?? 0), 0);
}

export interface Estimate {
  /** Bu kapsam için rehber alt sınır (TL). null = hesaplanamadı */
  min: number | null;
  units: number;
  tier: PricingTier | null;
}

export function estimate(questions: Question[], pricing: Pricing | null | undefined, answers: Answers): Estimate {
  if (!pricing || !pricing.enabled) return { min: null, units: 0, tier: null };
  const units = unitsFrom(questions, pricing, answers);
  let min = pricing.base + pricing.perUnit * units;
  for (const ad of pricing.addons) {
    const a = answers[ad.key];
    const vals = Array.isArray(a) ? a : a ? [a] : [];
    if (vals.some((v) => ad.values.includes(v))) min += ad.amount;
  }
  min = roundNice(min);
  const tier = pricing.tiers.find((t) => min >= t.from && (t.to === null || min < t.to)) ?? null;
  return { min: min > 0 ? min : null, units, tier };
}

/** Bütçe, rehber alt sınırının altında mı? Uyarıdır; gönderimi engellemez. */
export function isBudgetLow(est: Estimate, budget: number | null): boolean {
  return est.min !== null && budget !== null && budget > 0 && budget < est.min;
}

function roundNice(n: number): number {
  if (n <= 0) return 0;
  const step = n < 5000 ? 250 : n < 20000 ? 500 : 1000;
  return Math.round(n / step) * step;
}

export const tl = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n) + " ₺";

export const tierRange = (t: PricingTier) =>
  t.to === null ? `${tl(t.from)} ve üzeri` : t.from <= 0 ? `${tl(t.to)} altı` : `${tl(t.from)} – ${tl(t.to)}`;
