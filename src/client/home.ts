// Ana sayfa: bütçe rehberi hesaplayıcısı + örnek işler listesi.
import { estimate, tierRange, tl, type Pricing, type QuestionOption } from "../lib/pricing";

interface CalcItem {
  slug: string;
  name: string;
  unit: { key: string; label: string; type: string; min?: number; max?: number; placeholder?: string; options?: QuestionOption[] };
  pricing: Pricing;
}

const W = window as any;
const digits = (s: string) => s.replace(/\D/g, "");
const fmt = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ------------------------------------------------------------------ bütçe rehberi
const form = document.getElementById("hesap") as HTMLFormElement | null;
const dataEl = document.getElementById("hesap-data");
if (form && dataEl) {
  const items = JSON.parse(dataEl.textContent || "[]") as CalcItem[];
  const override = W.FIYAT_REHBERI || {};
  for (const it of items) if (override[it.slug]) it.pricing = { ...it.pricing, ...override[it.slug], enabled: true, verified: true };

  const sel = form.querySelector<HTMLSelectElement>("#h-hizmet")!;
  const scopeWrap = form.querySelector<HTMLElement>("#h-kapsam-alan")!;
  const budget = form.querySelector<HTMLInputElement>("#h-butce")!;
  const out = form.querySelector<HTMLElement>("#h-sonuc")!;
  const cur = () => items.find((x) => x.slug === sel.value) || items[0];

  function renderScope() {
    const it = cur();
    scopeWrap.textContent = "";
    const lab = el("label", "", it.unit.label);
    lab.htmlFor = "h-kapsam";
    scopeWrap.appendChild(lab);
    if (it.unit.type === "number") {
      const inp = el("input");
      inp.id = "h-kapsam";
      inp.name = it.unit.key;
      inp.inputMode = "numeric";
      inp.placeholder = it.unit.placeholder || "";
      inp.addEventListener("input", () => {
        inp.value = digits(inp.value).slice(0, 5);
        update();
      });
      scopeWrap.appendChild(inp);
    } else {
      const s = el("select");
      s.id = "h-kapsam";
      s.name = it.unit.key;
      for (const o of it.unit.options || []) {
        const op = el("option", "", o.label);
        op.value = o.value;
        s.appendChild(op);
      }
      s.addEventListener("change", update);
      scopeWrap.appendChild(s);
    }
  }

  function update() {
    const it = cur();
    const scopeEl = form!.querySelector<HTMLInputElement | HTMLSelectElement>("#h-kapsam");
    const scopeVal = scopeEl?.value || "";
    const b = Number(digits(budget.value)) || 0;
    out.textContent = "";
    out.className = "calc-result";
    if (!scopeVal) {
      out.appendChild(el("p", "calc-msg", "Kapsamı ve bütçeni gir; rehber burada görünecek."));
      return;
    }
    const est = estimate([it.unit as any], it.pricing, { [it.unit.key]: scopeVal });
    if (!est.min) {
      out.appendChild(el("p", "calc-msg", "Bu kapsam için rehber hesaplanamadı. Talep oluşturursan işine özel teklif hazırlanır."));
      return;
    }
    const head = el("div", "calc-range");
    head.appendChild(el("span", "calc-label", "Bu kapsam için rehber"));
    head.appendChild(el("strong", "calc-value", est.tier ? tierRange(est.tier) : `${tl(est.min)} civarından başlar`));
    out.appendChild(head);
    if (est.tier?.includes.length) out.appendChild(el("p", "calc-inc", `${est.tier.name}: ${est.tier.includes.join(", ")}`));

    if (b > 0) {
      const ratio = Math.min(b / est.min, 1);
      const meter = el("div", "meter");
      meter.setAttribute("aria-hidden", "true");
      const fill = el("span", "meter-fill");
      fill.style.width = Math.round(ratio * 100) + "%";
      meter.appendChild(fill);
      out.appendChild(meter);
      if (b >= est.min) {
        out.classList.add("is-ok");
        out.appendChild(el("p", "calc-msg", "Bütçen bu kapsamla uyumlu görünüyor. Detayları talep formunda netleştirebilirsin."));
      } else {
        out.classList.add("is-low");
        const p = it.pricing;
        const n = p.perUnit > 0 ? Math.floor((b - p.base) / p.perUnit) : 0;
        const unit = p.unitLabel || "birim";
        const msg =
          it.unit.type === "number" && n >= 1
            ? `Bu bütçeyle daha sınırlı bir paket oluşturabiliriz; örneğin yaklaşık ${fmt(n)} ${unit}. Daha fazla ${unit}, farklı konseptler veya kapsamlı düzenleme için bütçeni artırman gerekebilir.`
            : "Bu bütçeyle daha sınırlı bir kapsam oluşturabiliriz. Daha geniş bir kapsam için bütçeni artırman gerekebilir; talebini yine de gönder, birlikte en uygun seçeneği bulalım.";
        out.appendChild(el("p", "calc-msg", msg));
      }
    } else {
      out.appendChild(el("p", "calc-msg", "Bütçeni yaz, bu kapsamla karşılaştıralım."));
    }
  }

  sel.addEventListener("change", () => {
    renderScope();
    update();
  });
  budget.addEventListener("input", () => {
    const d = digits(budget.value).slice(0, 9);
    budget.value = d ? fmt(Number(d)) : "";
    update();
  });
  form.addEventListener("submit", () => {
    budget.value = digits(budget.value); // sayıyı forma ham haliyle taşı
    W.__track?.("form_start", { service: sel.value });
  });
  renderScope();
  update();
}

// ------------------------------------------------------------------ örnek işler (admin panelinden yüklenen gerçek işler)
interface Work {
  id: number;
  baslik: string;
  kategori: string;
  aciklama: string;
  link: string;
  url: string;
}
const grid = document.getElementById("isler");
const safeUrl = (u: unknown) => (typeof u === "string" && /^(https:\/\/|\/(?!\/))/.test(u) ? u : "");
if (grid) {
  fetch("/api/isler", { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { isler?: Work[] } | null) => {
      const list = (d?.isler || []).filter((w) => w && w.baslik && safeUrl(w.url)).slice(0, 6);
      if (!list.length) return;
      const slots = grid.querySelectorAll<HTMLElement>("li[data-slot]");
      list.forEach((w, i) => {
        const li = slots[i];
        if (!li) return;
        const media = li.querySelector(".w-media")!;
        const img = el("img");
        img.src = safeUrl(w.url);
        img.alt = w.baslik;
        img.loading = "lazy";
        img.decoding = "async";
        media.textContent = "";
        media.appendChild(img);
        const cap = li.querySelector(".w-cap")!;
        cap.textContent = "";
        cap.appendChild(el("span", "w-kat", w.kategori));
        cap.appendChild(el("span", "w-title", w.baslik));
        const link = safeUrl(w.link);
        if (link) {
          const a = el("a", "w-link");
          a.href = link;
          a.setAttribute("aria-label", w.baslik);
          if (/^https:/.test(link)) {
            a.target = "_blank";
            a.rel = "noopener";
          }
          li.querySelector(".w-fig")!.appendChild(a);
        }
      });
      // Tüm kutular gerçek işle dolduysa "temsili" notunu güncelle
      const note = document.getElementById("isler-not");
      if (note) note.textContent = list.length >= slots.length ? "Seçilmiş işlerimizden bir bölüm." : "Gerçek işler yayımlandıkça temsili kompozisyonların yerini alıyor.";
    })
    .catch(() => {});
}
