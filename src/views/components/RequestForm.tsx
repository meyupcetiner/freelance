// Adım adım iş talebi formu: kategori → alt hizmet → hizmete özel sorular → bütçe & zaman → iletişim → özet.
// Sunucuda render edilir, tarayıcıda canlanır. Taslak sekme kapanana kadar (sayfa yenilense de) korunur.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { estimate, isBudgetLow, tierRange, tl, type Answers, type Pricing, type Question } from "../../lib/pricing";
import { PREFS, TIMINGS } from "../../data/catalog";
import { Icon } from "./icons";

export interface FormService {
  slug: string;
  name: string;
  category: string;
  questions: Question[];
  pricing: Pricing | null;
}
export interface FormCategory {
  slug: string;
  name: string;
  short: string;
  icon: string;
}
export interface FormProps {
  categories: FormCategory[];
  services: FormService[];
  initialCategory?: string;
  initialService?: string;
  initialAnswers?: Answers;
  initialBudget?: string;
  /** Dosya ekleme yalnızca Worker backend'inde açık */
  allowFiles?: boolean;
  staticMode?: boolean;
  turnstileSiteKey?: string;
}

interface State {
  category: string;
  service: string;
  answers: Answers;
  description: string;
  budgetMode: "tutar" | "teklif";
  budget: string;
  timing: string;
  timingDate: string;
  name: string;
  phone: string;
  email: string;
  pref: string;
  company: string;
  kvkk: boolean;
  consent: boolean;
  website: string; // bal küpü
  idem: string;
}

interface Attached {
  name: string;
  file: File;
  note?: string;
}

const STEPS = ["Kategori", "Hizmet", "Detaylar", "Bütçe ve zaman", "İletişim", "Özet"] as const;
const DRAFT_KEY = "brif-talep-v2";
const MAX_FILES = 3;
const MAX_BYTES = 1_500_000;
const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const digits = (s: string) => s.replace(/\D/g, "");
const uid = () => {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
};

function emptyState(p: FormProps): State {
  const svc = p.services.find((s) => s.slug === p.initialService);
  const cat = svc?.category || (p.categories.some((c) => c.slug === p.initialCategory) ? p.initialCategory! : "");
  return {
    category: cat,
    service: svc?.slug || "",
    answers: { ...(p.initialAnswers || {}) },
    description: "",
    budgetMode: "tutar",
    budget: p.initialBudget || "",
    timing: "",
    timingDate: "",
    name: "",
    phone: "",
    email: "",
    pref: "telefon",
    company: "",
    kvkk: false,
    consent: false,
    website: "",
    idem: "",
  };
}
const startStep = (st: State) => (st.service ? 2 : st.category ? 1 : 0);

function track(name: string, data: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  (window as any).__track?.(name, data);
}

async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_BYTES) return file;
  const bmp = await createImageBitmap(file);
  let max = 2000;
  for (let i = 0; i < 5; i++) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    if (blob && blob.size <= MAX_BYTES) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    max = Math.round(max * 0.75);
  }
  return file;
}

export function RequestForm(props: FormProps) {
  const { categories, services, allowFiles } = props;
  const [st, setSt] = useState<State>(() => emptyState(props));
  const [step, setStep] = useState(() => startStep(emptyState(props)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Attached[]>([]);
  const [fileMsg, setFileMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [fallback, setFallback] = useState(false);
  const [done, setDone] = useState<{ ref: string } | null>(null);
  const [restored, setRestored] = useState(false);
  const startedAt = useRef(0);
  const started = useRef(false);
  const warnedOnce = useRef(false);
  const headRef = useRef<HTMLHeadingElement>(null);

  const cat = categories.find((c) => c.slug === st.category);
  const svc = services.find((s) => s.slug === st.service);
  const questions = svc?.questions ?? [];
  const est = useMemo(() => estimate(questions, svc?.pricing, st.answers), [svc, st.answers]);
  const budgetNum = st.budgetMode === "tutar" && st.budget ? Number(digits(st.budget)) : null;
  const low = isBudgetLow(est, budgetNum);

  // Taslağı geri yükle (yalnızca bu sekme; sayfa yenilense de korunur)
  useEffect(() => {
    startedAt.current = Date.now();
    const prefilled = !!(props.initialAnswers || props.initialBudget);
    try {
      const raw = prefilled ? null : sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const wanted = props.initialService || props.initialCategory;
        const matches = !wanted || d?.st?.service === props.initialService || (!props.initialService && d?.st?.category === props.initialCategory);
        if (d?.st && matches && (d.st.category || d.st.service)) {
          setSt({ ...emptyState(props), ...d.st, kvkk: false, website: "" });
          if (typeof d.step === "number") setStep(Math.min(d.step, 4));
          setRestored(true);
        }
      }
    } catch {}
    setSt((p) => (p.idem ? p : { ...p, idem: uid() }));
    track("form_step", { step: startStep(emptyState(props)) + 1, service: props.initialService || "" });
  }, []);

  useEffect(() => {
    if (done) return;
    try {
      const { kvkk, website, ...keep } = st;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ st: keep, step }));
    } catch {}
  }, [st, step, done]);

  useEffect(() => {
    const dirty = !done && (Object.keys(st.answers).length > 0 || st.description || st.name);
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [st, done]);

  useEffect(() => {
    if (low && !warnedOnce.current) {
      warnedOnce.current = true;
      track("budget_warning", { service: st.service });
    }
  }, [low]);

  const set = <K extends keyof State>(k: K, v: State[K]) => {
    if (!started.current) {
      started.current = true;
      track("form_start", { service: st.service });
    }
    setSt((p) => ({ ...p, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: "" }));
  };
  const setAnswer = (key: string, v: string | string[]) => {
    setSt((p) => ({ ...p, answers: { ...p.answers, [key]: v } }));
    if (errors["q_" + key]) setErrors((e) => ({ ...e, ["q_" + key]: "" }));
  };

  function validate(n: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (n === 0 && !st.category) e.category = "Devam etmek için bir kategori seç.";
    if (n === 1 && !st.service) e.service = "Devam etmek için bir hizmet seç.";
    if (n === 2) {
      for (const q of questions) {
        const a = st.answers[q.key];
        const empty = a === undefined || a === "" || (Array.isArray(a) && a.length === 0);
        if (q.required && empty) e["q_" + q.key] = "Bu soruyu yanıtla.";
        if (q.type === "number" && !empty) {
          const v = Number(a);
          if (!Number.isFinite(v) || v < (q.min ?? 0) || (q.max !== undefined && v > q.max)) e["q_" + q.key] = `${q.min ?? 0} ile ${q.max ?? "∞"} arasında bir sayı gir.`;
        }
      }
      if (st.description.length > 3000) e.description = "Açıklama en fazla 3000 karakter olabilir.";
    }
    if (n === 3) {
      if (st.budgetMode === "tutar") {
        const v = Number(digits(st.budget));
        if (!st.budget || !v) e.budget = "Bir tutar gir ya da “Teklif almak istiyorum” seçeneğini işaretle.";
        else if (v > 100_000_000) e.budget = "Tutar çok yüksek görünüyor, kontrol eder misin?";
      }
      if (!st.timing) e.timing = "Ne zaman tamamlanması gerektiğini seç.";
      if (st.timing === "belirli-tarih" && !st.timingDate) e.timingDate = "Tarihi seç.";
    }
    if (n === 4) {
      if (st.name.trim().length < 3 || !/\s/.test(st.name.trim())) e.name = "Adını ve soyadını yaz.";
      const ph = digits(st.phone);
      if (ph.length < 10 || ph.length > 13) e.phone = "Telefon numarasını alan koduyla gir (ör. 0532 123 45 67).";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(st.email.trim())) e.email = "Geçerli bir e-posta adresi gir.";
      if (!st.kvkk) e.kvkk = "Devam etmek için aydınlatma metnini okuduğunu onayla.";
    }
    return e;
  }

  function goto(n: number) {
    setStep(n);
    setErrors({});
    setSendError("");
    track("form_step", { step: n + 1, service: st.service });
    requestAnimationFrame(() => {
      const el = headRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function next() {
    const e = validate(step);
    if (Object.values(e).some(Boolean)) {
      setErrors(e);
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    goto(step + 1);
  }

  function chooseCategory(slug: string) {
    setSt((p) => (p.category === slug ? p : { ...p, category: slug, service: "", answers: {} }));
    if (!started.current) {
      started.current = true;
      track("form_start", { service: "" });
    }
    goto(1);
  }
  function chooseService(slug: string) {
    setSt((p) => (p.service === slug ? p : { ...p, service: slug, answers: {} }));
    goto(2);
  }

  async function addFiles(list: FileList | null) {
    setFileMsg("");
    if (!list) return;
    const next: Attached[] = [...files];
    for (const raw of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setFileMsg(`En fazla ${MAX_FILES} dosya ekleyebilirsin.`);
        break;
      }
      if (!FILE_TYPES.includes(raw.type)) {
        setFileMsg(`"${raw.name}" eklenemedi: yalnızca JPG, PNG, WebP veya PDF.`);
        continue;
      }
      let f = raw;
      try {
        f = await shrinkImage(raw);
      } catch {}
      if (f.size > MAX_BYTES) {
        setFileMsg(`"${raw.name}" çok büyük (en fazla 1,5 MB). PDF ise sıkıştırıp tekrar dene.`);
        continue;
      }
      next.push({ name: raw.name, file: f, note: f !== raw ? "küçültüldü" : undefined });
    }
    setFiles(next);
  }

  async function submit() {
    for (let i = 0; i <= 4; i++) {
      const e = validate(i);
      if (Object.values(e).some(Boolean)) {
        setStep(i);
        setErrors(e);
        return;
      }
    }
    if (sending) return; // çift tıklamaya karşı
    setSending(true);
    setSendError("");
    setFallback(false);
    let kaynak: Record<string, string> = {};
    try {
      kaynak = JSON.parse(sessionStorage.getItem("src") || "{}");
    } catch {}
    const veri = {
      kategori: st.category,
      hizmet: st.service,
      cevaplar: st.answers,
      aciklama: st.description,
      butce_tur: st.budgetMode,
      butce: st.budgetMode === "tutar" ? Number(digits(st.budget)) : null,
      zaman: st.timing,
      zaman_tarih: st.timing === "belirli-tarih" ? st.timingDate : null,
      ad: st.name,
      telefon: st.phone,
      eposta: st.email,
      tercih: st.pref,
      firma: st.company,
      kvkk: st.kvkk,
      iletisim_izni: st.consent,
      website: st.website,
      elapsed: Date.now() - startedAt.current,
      idem: st.idem || uid(),
      kaynak,
    };
    try {
      let res: Response;
      if (allowFiles && files.length) {
        const fd = new FormData();
        fd.append("veri", JSON.stringify(veri));
        for (const f of files) fd.append("dosya", f.file, f.name);
        res = await fetch("/api/talep", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/talep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(veri) });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data.error || "Talep gönderilemedi. Birazdan tekrar dene.");
        if (res.status >= 500 || res.status === 404 || res.status === 405) setFallback(true);
        if (data.fields) {
          const map: Record<string, string> = { kategori: "category", hizmet: "service", aciklama: "description", butce: "budget", zaman: "timing", zaman_tarih: "timingDate", ad: "name", telefon: "phone", eposta: "email", kvkk: "kvkk", dosya: "files" };
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.fields as Record<string, string>)) mapped[map[k] || k] = v;
          setErrors(mapped);
          const stepOf = (k: string) => (k === "category" ? 0 : k === "service" ? 1 : k.startsWith("q_") || k === "description" ? 2 : ["budget", "timing", "timingDate", "files"].includes(k) ? 3 : 4);
          const first = Object.keys(mapped)[0];
          if (first && first !== "idem") setStep(stepOf(first));
        }
        return;
      }
      track("form_submit", { service: st.service });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      setDone({ ref: data.ref });
      requestAnimationFrame(() => headRef.current?.focus());
    } catch {
      setSendError("Sunucuya ulaşılamadı. Girdiğin bilgiler kaybolmadı; bağlantını kontrol edip tekrar dene.");
      setFallback(true);
    } finally {
      setSending(false);
    }
  }

  function resetDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    const s = { ...emptyState(props), idem: uid() };
    setSt(s);
    setFiles([]);
    setRestored(false);
    goto(startStep(s));
  }

  // ------------------------------------------------------------------ gönderildi
  if (done) {
    return (
      <div className="req-card req-done" role="status">
        <img className="done-art" src="/assets/ill/celebrating-success.svg" alt="" width="220" height="184" />
        <h2 tabIndex={-1} ref={headRef}>Talebin alındı</h2>
        <p>
          Talep numaran <strong className="ref">{done.ref}</strong>. Bu numarayı not alırsan yazışmalarda talebini hızlıca buluruz.
        </p>
        <h3>Bundan sonra ne olacak?</h3>
        <ol className="done-steps">
          <li>Talebin okunur ve kapsamı değerlendirilir.</li>
          <li>Eksik bir bilgi varsa önce sana sorulur.</li>
          <li>Uygunsa {PREFS.find((p) => p.value === st.pref)?.label} üzerinden teklifle dönüş yapılır; genellikle birkaç iş günü içinde.</li>
        </ol>
        <p className="small muted">Talep göndermek seni hiçbir hizmeti almaya zorunlu kılmaz.</p>
        <div className="head-actions">
          <a className="btn btn-primary" href="/">Ana sayfaya dön</a>
          <a className="text-link" href="/talep-olustur">Yeni talep oluştur</a>
        </div>
      </div>
    );
  }

  const err = (k: string) => errors[k] || "";
  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  const ayar = typeof window !== "undefined" ? (window as any).SITE_AYAR || {} : {};
  const wa = String(ayar.whatsapp || "").replace(/\D/g, "").replace(/^0/, "90");

  return (
    <form
      className="req-card"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        step < 5 ? next() : submit();
      }}
    >
      <div className="progress" aria-hidden="true">
        <div className="progress-bar" style={{ width: pct + "%" }} />
      </div>
      <ol className="stepper" aria-label="Form adımları">
        {STEPS.map((l, i) => (
          <li key={l} className={i === step ? "is-current" : i < step ? "is-done" : ""} aria-current={i === step ? "step" : undefined}>
            {i < step ? (
              <button type="button" className="linklike" onClick={() => goto(i)}>
                {l}
              </button>
            ) : (
              <span>{l}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="step-count">
        Adım {step + 1} / {STEPS.length}
      </p>

      {cat && step > 0 && step < 5 ? (
        <div className="picked" aria-label="Seçimin">
          <button type="button" className="picked-chip" onClick={() => goto(0)} aria-label={`Kategori: ${cat.name}. Değiştir`}>
            <Icon name={cat.icon} size={16} />
            {cat.name}
          </button>
          {svc && step > 1 ? (
            <button type="button" className="picked-chip is-sub" onClick={() => goto(1)} aria-label={`Hizmet: ${svc.name}. Değiştir`}>
              {svc.name}
            </button>
          ) : null}
        </div>
      ) : null}

      {restored && step < 5 ? (
        <p className="note">
          Önceki taslağın geri yüklendi.{" "}
          <button type="button" className="linklike" onClick={resetDraft}>
            Baştan başla
          </button>
        </p>
      ) : null}

      {/* -------------------------------------------- 1. KATEGORİ */}
      {step === 0 && (
        <fieldset className="fs">
          <legend>
            <h2 tabIndex={-1} ref={headRef}>Hangi alanda desteğe ihtiyacın var?</h2>
          </legend>
          <div className="cat-pick" role="radiogroup" aria-label="Ana kategori" aria-invalid={!!err("category")} aria-describedby={err("category") ? "e-category" : undefined}>
            {categories.map((c, i) => (
              <label key={c.slug} className={"cat-opt" + (st.category === c.slug ? " is-on" : "")}>
                <input type="radio" name="category" value={c.slug} checked={st.category === c.slug} onChange={() => chooseCategory(c.slug)} />
                <span className="cat-opt-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="cat-opt-txt">
                  <span className="cat-opt-name">{c.name}</span>
                  <span className="cat-opt-short">{c.short}</span>
                </span>
                <span className="cat-opt-ico"><Icon name={c.icon} /></span>
              </label>
            ))}
          </div>
          <FieldError id="e-category" msg={err("category")} />
        </fieldset>
      )}

      {/* -------------------------------------------- 2. ALT HİZMET */}
      {step === 1 && cat && (
        <fieldset className="fs">
          <legend>
            <h2 tabIndex={-1} ref={headRef}>{cat.name}: hangi hizmet?</h2>
          </legend>
          <div className="choice-list sub-list" role="radiogroup" aria-label="Alt hizmet" aria-invalid={!!err("service")} aria-describedby={err("service") ? "e-service" : undefined}>
            {services
              .filter((s) => s.category === cat.slug)
              .map((s) => (
                <label key={s.slug} className={"choice" + (st.service === s.slug ? " is-on" : "")}>
                  <input type="radio" name="service" value={s.slug} checked={st.service === s.slug} onChange={() => chooseService(s.slug)} />
                  <span>{s.name}</span>
                </label>
              ))}
          </div>
          <FieldError id="e-service" msg={err("service")} />
        </fieldset>
      )}

      {/* -------------------------------------------- 3. DETAYLAR */}
      {step === 2 && svc && (
        <fieldset className="fs">
          <legend>
            <h2 tabIndex={-1} ref={headRef}>Proje detayları</h2>
          </legend>
          <p className="hint">Birkaç kısa soru. Zorunlu olmayanları boş bırakabilirsin.</p>
          {questions.map((q) => (
            <QuestionField key={q.key} q={q} value={st.answers[q.key]} onChange={(v) => setAnswer(q.key, v)} error={err("q_" + q.key)} />
          ))}
          <Field id="f-desc" label="Projeni kısaca anlat" optional error={err("description")} help="Beğendiğin örneklerin bağlantılarını da ekleyebilirsin.">
            <textarea id="f-desc" rows={4} maxLength={3000} value={st.description} onChange={(e) => set("description", e.target.value)} aria-invalid={!!err("description")} aria-describedby={err("description") ? "f-desc-err" : "f-desc-help"} />
          </Field>
        </fieldset>
      )}

      {/* -------------------------------------------- 4. BÜTÇE VE ZAMAN */}
      {step === 3 && (
        <fieldset className="fs">
          <legend>
            <h2 tabIndex={-1} ref={headRef}>Bütçe ve zaman</h2>
          </legend>
          <div className="seg" role="radiogroup" aria-label="Bütçe türü">
            <span className="seg-label">Tahmini bütçen</span>
            <label className={"seg-opt" + (st.budgetMode === "tutar" ? " is-on" : "")}>
              <input type="radio" name="bm" checked={st.budgetMode === "tutar"} onChange={() => set("budgetMode", "tutar")} />
              Bir bütçem var
            </label>
            <label className={"seg-opt" + (st.budgetMode === "teklif" ? " is-on" : "")}>
              <input type="radio" name="bm" checked={st.budgetMode === "teklif"} onChange={() => set("budgetMode", "teklif")} />
              Teklif almak istiyorum
            </label>
          </div>
          {st.budgetMode === "tutar" ? (
            <Field id="f-budget" label="Bütçe (TL)" error={err("budget")} help={svc?.pricing?.budgetHint || "Yaklaşık bir rakam yeterli."}>
              <div className="money">
                <input
                  id="f-budget"
                  inputMode="numeric"
                  autoComplete="off"
                  value={st.budget ? new Intl.NumberFormat("tr-TR").format(Number(digits(st.budget)) || 0) : ""}
                  onChange={(e) => set("budget", digits(e.target.value).slice(0, 10))}
                  aria-invalid={!!err("budget")}
                  aria-describedby={["f-budget-help", err("budget") ? "f-budget-err" : "", low ? "budget-warn" : ""].filter(Boolean).join(" ")}
                />
                <span aria-hidden="true">₺</span>
              </div>
            </Field>
          ) : null}
          {low ? (
            <p id="budget-warn" className="budget-warn" role="status">
              Bu bütçeyle daha sınırlı bir kapsam oluşturabiliriz.
              {est.min ? <> Bu kapsamdaki işler rehbere göre genellikle <strong>{tl(est.min)}</strong> civarından başlıyor.</> : null} Daha geniş bir kapsam için bütçeni artırman gerekebilir. İstersen bu tutarla devam et; birlikte en uygun kapsamı belirleriz.
            </p>
          ) : null}
          {svc?.pricing && est.min && svc.pricing.tiers.length ? (
            <div className="guide">
              <p className="guide-h">Rehber: verdiğin cevaplara göre</p>
              <ul className="tiers compact">
                {svc.pricing.tiers.map((t) => (
                  <li key={t.name} className={est.tier?.name === t.name ? "is-on" : ""}>
                    <span className="tier-name">{t.name}</span>
                    <span className="tier-range">{tierRange(t)}</span>
                    <span className="tier-inc">{t.includes.join(", ")}</span>
                  </li>
                ))}
              </ul>
              <p className="small muted">Rehber tutardır, kesin teklif değildir.</p>
            </div>
          ) : null}

          <fieldset className="field" aria-describedby={err("timing") ? "e-timing" : undefined}>
            <legend>İşin ne zaman tamamlanmasını istiyorsun?</legend>
            <div className="choice-list compact" role="radiogroup" aria-invalid={!!err("timing")} tabIndex={err("timing") ? -1 : undefined}>
              {TIMINGS.map((t) => (
                <label key={t.value} className={"choice" + (st.timing === t.value ? " is-on" : "")}>
                  <input type="radio" name="timing" value={t.value} checked={st.timing === t.value} onChange={() => set("timing", t.value)} />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
            <FieldError id="e-timing" msg={err("timing")} />
          </fieldset>
          {st.timing === "belirli-tarih" ? (
            <Field id="f-date" label="Tarih" error={err("timingDate")}>
              <input id="f-date" type="date" value={st.timingDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set("timingDate", e.target.value)} aria-invalid={!!err("timingDate")} aria-describedby={err("timingDate") ? "f-date-err" : undefined} />
            </Field>
          ) : null}

          {allowFiles ? (
            <div className={"field" + (err("files") || fileMsg ? " has-err" : "")}>
              <span className="label-like" id="f-files-l">Referans dosya veya görsel <span className="opt">(isteğe bağlı)</span></span>
              <label className={"drop" + (files.length >= MAX_FILES ? " is-full" : "")}>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} aria-labelledby="f-files-l" aria-describedby="f-files-help" disabled={files.length >= MAX_FILES} />
                <Icon name="kapsam" size={20} />
                <span>{files.length >= MAX_FILES ? "Dosya sınırına ulaştın" : "Dosya seç"}</span>
              </label>
              <p id="f-files-help" className="help">En fazla {MAX_FILES} dosya; JPG, PNG, WebP veya PDF, dosya başına 1,5 MB. Büyük fotoğraflar otomatik küçültülür.</p>
              {files.length ? (
                <ul className="file-list">
                  {files.map((f, i) => (
                    <li key={i}>
                      <span className="file-name">{f.name}</span>
                      <span className="muted small">{Math.max(1, Math.round(f.file.size / 1024))} KB{f.note ? `, ${f.note}` : ""}</span>
                      <button type="button" className="linklike small" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`${f.name} dosyasını kaldır`}>
                        Kaldır
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <FieldError id="e-files" msg={fileMsg || err("files")} />
            </div>
          ) : null}
        </fieldset>
      )}

      {/* -------------------------------------------- 5. İLETİŞİM */}
      {step === 4 && (
        <fieldset className="fs">
          <legend>
            <h2 tabIndex={-1} ref={headRef}>İletişim bilgilerin</h2>
          </legend>
          <p className="hint">Yalnızca bu talebe dönüş yapmak için kullanılır.</p>
          <Field id="f-name" label="Ad soyad" error={err("name")}>
            <input id="f-name" autoComplete="name" value={st.name} maxLength={80} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} aria-describedby={err("name") ? "f-name-err" : undefined} />
          </Field>
          <div className="grid-2-form">
            <Field id="f-phone" label="Telefon" error={err("phone")}>
              <input id="f-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={20} placeholder="05xx xxx xx xx" value={st.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!err("phone")} aria-describedby={err("phone") ? "f-phone-err" : undefined} />
            </Field>
            <Field id="f-email" label="E-posta" error={err("email")}>
              <input id="f-email" type="email" autoComplete="email" inputMode="email" maxLength={160} value={st.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!err("email")} aria-describedby={err("email") ? "f-email-err" : undefined} />
            </Field>
          </div>
          <div className="seg" role="radiogroup" aria-label="Dönüş tercihi">
            <span className="seg-label">Sana nasıl dönelim?</span>
            {PREFS.map((p) => (
              <label key={p.value} className={"seg-opt" + (st.pref === p.value ? " is-on" : "")}>
                <input type="radio" name="pref" checked={st.pref === p.value} onChange={() => set("pref", p.value)} />
                {p.label}
              </label>
            ))}
          </div>
          <Field id="f-company" label="Firma veya marka adı" optional>
            <input id="f-company" autoComplete="organization" maxLength={120} value={st.company} onChange={(e) => set("company", e.target.value)} />
          </Field>
          <div className="hp" aria-hidden="true">
            <label htmlFor="f-website">Web sitesi</label>
            <input id="f-website" tabIndex={-1} autoComplete="off" value={st.website} onChange={(e) => set("website", e.target.value)} />
          </div>
          <div className={"check" + (err("kvkk") ? " has-err" : "")}>
            <input id="f-kvkk" type="checkbox" checked={st.kvkk} onChange={(e) => set("kvkk", e.target.checked)} aria-invalid={!!err("kvkk")} aria-describedby={err("kvkk") ? "f-kvkk-err" : undefined} />
            <label htmlFor="f-kvkk">
              Bilgilerimin bu talebe dönüş yapılması amacıyla işleneceğini anlatan{" "}
              <a href="/kvkk-aydinlatma-metni" target="_blank" rel="noopener">
                KVKK aydınlatma metnini
              </a>{" "}
              okudum.
            </label>
          </div>
          <FieldError id="f-kvkk-err" msg={err("kvkk")} />
          <div className="check">
            <input id="f-consent" type="checkbox" checked={st.consent} onChange={(e) => set("consent", e.target.checked)} />
            <label htmlFor="f-consent">
              Brif'in kampanya ve bilgilendirme iletilerini telefon ve e-posta ile almak istiyorum. <span className="opt">(isteğe bağlı)</span>
            </label>
          </div>
        </fieldset>
      )}

      {/* -------------------------------------------- 6. ÖZET */}
      {step === 5 && (
        <div className="fs">
          <h2 tabIndex={-1} ref={headRef}>Göndermeden önce kontrol et</h2>
          <dl className="summary">
            <SumRow label="Kategori" onEdit={() => goto(0)}>{cat?.name}</SumRow>
            <SumRow label="Hizmet" onEdit={() => goto(1)}>{svc?.name}</SumRow>
            <SumRow label="Detaylar" onEdit={() => goto(2)}>
              {questions
                .filter((q) => st.answers[q.key] !== undefined && st.answers[q.key] !== "" && !(Array.isArray(st.answers[q.key]) && !(st.answers[q.key] as string[]).length))
                .map((q) => (
                  <span key={q.key} className="block">
                    {q.label.replace(/[?:]$/, "")}: <strong>{answerLabel(q, st.answers[q.key])}</strong>
                  </span>
                ))}
              {st.description ? <span className="block pre">{st.description}</span> : null}
            </SumRow>
            <SumRow label="Bütçe ve zaman" onEdit={() => goto(3)}>
              {st.budgetMode === "teklif" ? "Teklif almak istiyorum" : tl(Number(digits(st.budget)))}
              {low ? <span className="block small warn-text">Rehbere göre kapsam için düşük olabilir</span> : null}
              <span className="block">
                {TIMINGS.find((t) => t.value === st.timing)?.label}
                {st.timing === "belirli-tarih" && st.timingDate ? ` (${new Date(st.timingDate + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })})` : ""}
              </span>
              {files.length ? <span className="block small muted">{files.length} dosya eklendi</span> : null}
            </SumRow>
            <SumRow label="İletişim" onEdit={() => goto(4)}>
              {st.name}
              <span className="block">{st.phone}, {st.email}</span>
              <span className="block small muted">Dönüş tercihi: {PREFS.find((p) => p.value === st.pref)?.label}</span>
            </SumRow>
          </dl>
          {sendError ? (
            <div className="form-error" role="alert">
              <p>{sendError}</p>
              {fallback && (wa || ayar.email) ? (
                <p className="small">
                  Sorun sürerse talebini doğrudan da iletebilirsin:{" "}
                  {wa ? <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Merhaba, ${svc?.name} için talep oluşturmak istiyorum.`)}`} target="_blank" rel="noopener">WhatsApp</a> : null}
                  {wa && ayar.email ? " · " : null}
                  {ayar.email ? <a href={`mailto:${ayar.email}`}>E-posta</a> : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="form-nav">
        {step > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={() => goto(step - 1)} disabled={sending}>
            Geri
          </button>
        ) : (
          <span />
        )}
        {step >= 2 ? (
          <button type="submit" className={"btn " + (step === 5 ? "btn-signal btn-lg" : "btn-primary")} disabled={sending} aria-busy={sending}>
            {step === 5 ? (sending ? "Gönderiliyor…" : "Talebi gönder") : "Devam"}
          </button>
        ) : (step === 0 && st.category) || (step === 1 && st.service) ? (
          <button type="button" className="btn btn-primary" onClick={() => goto(step + 1)}>
            Devam
          </button>
        ) : null}
      </div>
    </form>
  );
}

function answerLabel(q: Question, a: string | string[] | undefined): string {
  if (a === undefined) return "";
  const vals = Array.isArray(a) ? a : [a];
  if (!q.options) return vals.join(", ");
  return vals.map((v) => q.options!.find((o) => o.value === v)?.label ?? v).join(", ");
}

function SumRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit: () => void }) {
  return (
    <div className="sum-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
      <dd className="sum-edit">
        <button type="button" className="linklike" onClick={onEdit} aria-label={`${label} bölümünü düzenle`}>
          Düzenle
        </button>
      </dd>
    </div>
  );
}

function FieldError({ id, msg }: { id: string; msg: string }) {
  return msg ? (
    <p id={id} className="field-err">
      {msg}
    </p>
  ) : null;
}

function Field({ id, label, children, error, help, optional }: { id: string; label: string; children: ReactNode; error?: string; help?: string; optional?: boolean }) {
  return (
    <div className={"field" + (error ? " has-err" : "")}>
      <label htmlFor={id}>
        {label}
        {optional ? <span className="opt"> (isteğe bağlı)</span> : null}
      </label>
      {children}
      {help ? (
        <p id={id + "-help"} className="help">
          {help}
        </p>
      ) : null}
      <FieldError id={id + "-err"} msg={error || ""} />
    </div>
  );
}

function QuestionField({ q, value, onChange, error }: { q: Question; value: string | string[] | undefined; onChange: (v: string | string[]) => void; error: string }) {
  const id = "q-" + q.key;
  const opt = !q.required;
  const desc = [q.help ? id + "-help" : "", error ? id + "-err" : ""].filter(Boolean).join(" ") || undefined;
  if (q.type === "radio" || q.type === "checkboxes") {
    const multi = q.type === "checkboxes";
    const vals = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <fieldset className={"field" + (error ? " has-err" : "")} aria-describedby={desc}>
        <legend>
          {q.label}
          {opt ? <span className="opt"> (isteğe bağlı)</span> : null}
          {multi ? <span className="opt"> birden fazla seçebilirsin</span> : null}
        </legend>
        <div className="choice-list compact" aria-invalid={!!error} tabIndex={error ? -1 : undefined}>
          {q.options?.map((o) => {
            const on = vals.includes(o.value);
            return (
              <label key={o.value} className={"choice" + (on ? " is-on" : "")}>
                <input type={multi ? "checkbox" : "radio"} name={id} value={o.value} checked={on} onChange={() => onChange(multi ? (on ? vals.filter((v) => v !== o.value) : [...vals, o.value]) : o.value)} />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
        {q.help ? <p id={id + "-help"} className="help">{q.help}</p> : null}
        {error ? <p id={id + "-err"} className="field-err">{error}</p> : null}
      </fieldset>
    );
  }
  return (
    <div className={"field" + (error ? " has-err" : "")}>
      <label htmlFor={id}>
        {q.label}
        {opt ? <span className="opt"> (isteğe bağlı)</span> : null}
      </label>
      {q.type === "textarea" ? (
        <textarea id={id} rows={3} maxLength={1000} value={(value as string) || ""} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={desc} />
      ) : (
        <input
          id={id}
          type="text"
          inputMode={q.type === "number" ? "numeric" : undefined}
          maxLength={q.type === "number" ? 7 : 200}
          value={(value as string) || ""}
          placeholder={q.placeholder}
          onChange={(e) => onChange(q.type === "number" ? digits(e.target.value) : e.target.value)}
          aria-invalid={!!error}
          aria-describedby={desc}
        />
      )}
      {q.help ? <p id={id + "-help"} className="help">{q.help}</p> : null}
      {error ? <p id={id + "-err"} className="field-err">{error}</p> : null}
    </div>
  );
}
