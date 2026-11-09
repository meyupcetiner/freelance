import { createRoot, hydrateRoot } from "react-dom/client";
import { RequestForm, type FormProps } from "../views/components/RequestForm";

const el = document.getElementById("talep-root");
const propsEl = document.getElementById("talep-props");
if (el && propsEl) {
  const props = JSON.parse(propsEl.textContent || "{}") as FormProps & { pageMap?: Record<string, string> };
  // Fiyat kuralları fiyatlar.js ile değiştirilebilir (statik sürüm)
  const FR = (window as any).FIYAT_REHBERI || {};
  const refs = (props as any).priceRefs || {};
  for (const s of props.services) {
    const r = refs[s.slug];
    if (r && FR[r] && s.pricing) s.pricing = { ...s.pricing, ...FR[r], enabled: true, verified: true };
  }
  // URL'den ön seçim: ?kategori=… veya ?hizmet=… (eski hizmet sayfası adları da eşlenir) + bütçe rehberinden gelen cevaplar
  const qs = new URLSearchParams(location.search);
  let hz = qs.get("hizmet") || "";
  if (props.pageMap?.[hz]) hz = props.pageMap[hz];
  const svc = props.services.find((s) => s.slug === hz);
  const kat = qs.get("kategori") || "";
  let changed = false;
  if (svc) {
    props.initialService = svc.slug;
    changed = true;
    const answers: Record<string, string> = {};
    for (const q of svc.questions) {
      const v = qs.get(q.key);
      if (v && (q.type !== "number" || /^\d{1,6}$/.test(v)) && (!q.options || q.options.some((o) => o.value === v))) answers[q.key] = v;
    }
    if (Object.keys(answers).length) props.initialAnswers = answers;
    const b = (qs.get("butce") || "").replace(/\D/g, "").slice(0, 9);
    if (b) props.initialBudget = b;
  } else if (props.categories.some((c) => c.slug === kat)) {
    props.initialCategory = kat;
    changed = true;
  }
  if (props.staticMode || changed) {
    el.innerHTML = "";
    createRoot(el).render(<RequestForm {...props} />);
  } else {
    hydrateRoot(el, <RequestForm {...props} />);
  }
}
