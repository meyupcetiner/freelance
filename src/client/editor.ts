// Brif görsel sayfa düzenleyici (yalnızca yönetim paneli).
// Canlı alan, gerçek sayfanın kendisidir: işaretlenmiş HTML + taslak tasarım (applyDesign, Worker ile aynı kod).
import {
  applyDesign, designCss, uid, BP_LABEL, DEFAULT_COLS, ITEM_TIPS,
  type Bp, type Design, type ElOv, type ItemTip, type Style,
} from "../lib/tasarim";

interface Page { yol: string; ad: string }
interface Boot { yol: string; pages: Page[]; taslak: Design | null; yayin: Design | null; taslak_at: string | null; yayin_at: string | null }
interface Medya { id: number; ad: string; alt: string; url: string; boyut: number }

const boot = JSON.parse(document.getElementById("ed-data")!.textContent || "{}") as Boot;
const root = document.getElementById("ed-root")!;
const VW: Record<Bp, number> = { d: 1280, t: 820, m: 390 };
const SWATCH = ["#191919", "#FFFFFF", "#77EA2F", "#4C7FF0", "#F2F3EF", "#F0F7E9", "#6B7066"];
const KIND_LABEL: Record<string, string> = { blok: "Bölüm", h: "Başlık", p: "Metin", t: "Kısa metin", btn: "Buton", img: "Görsel", l: "Liste / ızgara", item: "Kart / öge", box: "Kutu" };

// ------------------------------------------------------------------ durum
let design: Design = clone(boot.taslak || boot.yayin || { v: 1 });
let savedStr = JSON.stringify(design);
let publishedStr = JSON.stringify(boot.yayin || { v: 1 });
let bp: Bp = "d";
let sel: string | null = null;
let base = ""; // işaretlenmiş, tasarımsız sayfa HTML'i
const hist: string[] = [JSON.stringify(design)];
let hi = 0;

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
function ov(id: string): ElOv { design.el ||= {}; return (design.el[id] ||= {}); }
function st(id: string, b: Bp = bp): Style { const o = ov(id); o.s ||= {}; return (o.s[b] ||= {}); }
function prune() {
  for (const [id, o] of Object.entries(design.el || {})) {
    if (o.s) {
      for (const k of Object.keys(o.s) as Bp[]) {
        const s = o.s[k] as Record<string, unknown>;
        for (const kk of Object.keys(s)) if (s[kk] === undefined || s[kk] === "") delete s[kk];
        if (!Object.keys(s).length) delete o.s[k];
      }
      if (!Object.keys(o.s).length) delete o.s;
    }
    if (!Object.keys(o).length) delete design.el![id];
  }
}
function commit(rerenderAll = true) {
  prune();
  const s = JSON.stringify(design);
  if (s === hist[hi]) { if (rerenderAll) render(); return; }
  hist.splice(hi + 1);
  hist.push(s);
  if (hist.length > 120) hist.shift();
  hi = hist.length - 1;
  if (rerenderAll) render(); else css();
  ui();
}
const dirty = () => JSON.stringify(design) !== savedStr;

// ------------------------------------------------------------------ iskelet
root.innerHTML = `
<header class="ed-top">
  <a class="ed-back" href="/admin" title="Yönetim paneline dön">←</a>
  <span class="ed-brand"><span class="ed-dot"></span>Görsel düzenleyici</span>
  <label class="ed-page"><span class="sr">Sayfa</span><select id="ed-page"></select></label>
  <div class="ed-vp" role="group" aria-label="Görünüm">
    <button type="button" data-vp="d" aria-pressed="true">Masaüstü</button><button type="button" data-vp="t" aria-pressed="false">Tablet</button><button type="button" data-vp="m" aria-pressed="false">Mobil</button>
  </div>
  <div class="ed-hist"><button type="button" id="ed-undo" title="Geri al (Ctrl+Z)">↶</button><button type="button" id="ed-redo" title="Tekrar yap (Ctrl+Shift+Z)">↷</button></div>
  <span class="ed-status" id="ed-status" aria-live="polite"></span>
  <div class="ed-actions">
    <button type="button" class="ed-btn" id="ed-preview">Önizle</button>
    <button type="button" class="ed-btn" id="ed-save">Taslak olarak kaydet</button>
    <button type="button" class="ed-btn ed-primary" id="ed-publish">Yayınla</button>
  </div>
</header>
<aside class="ed-left">
  <div class="ed-tabs" role="tablist"><button type="button" role="tab" data-tab="ekle" aria-selected="true">Ögeler</button><button type="button" role="tab" data-tab="katman" aria-selected="false">Bölümler</button></div>
  <div class="ed-tabpane" id="tab-ekle"><p class="ed-hint">Bir öge seç: seçili bölüme (ya da altına yeni bölüm olarak) eklenir.</p><ul class="ed-add" id="ed-add"></ul></div>
  <div class="ed-tabpane" id="tab-katman" hidden><p class="ed-hint">Sürükleyerek sırala, tıklayarak seç.</p><ol class="ed-layers" id="ed-layers"></ol></div>
</aside>
<main class="ed-canvas" id="ed-canvas"><div class="ed-stage" id="ed-stage"><iframe id="ed-frame" title="Canlı tasarım alanı"></iframe></div></main>
<aside class="ed-right" id="ed-props"></aside>
<dialog class="ed-modal" id="ed-media"><form method="dialog" class="ed-modal-in">
  <header><h2>Görseller</h2><button value="kapat" class="ed-x" aria-label="Kapat">×</button></header>
  <div class="ed-upload"><label class="ed-btn ed-primary">Bilgisayardan yükle<input type="file" id="ed-file" accept="image/jpeg,image/png,image/webp" hidden></label><span class="ed-hint" id="ed-upmsg">JPG, PNG, WebP. Büyük görseller otomatik küçültülür.</span></div>
  <ul class="ed-media-grid" id="ed-media-grid"></ul>
</form></dialog>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const frame = $<HTMLIFrameElement>("ed-frame");
const stage = $("ed-stage");
const canvas = $("ed-canvas");
const props = $("ed-props");
const statusEl = $("ed-status");
const fdoc = () => frame.contentDocument!;

// sayfa seçici
const pageSel = $<HTMLSelectElement>("ed-page");
for (const p of boot.pages) {
  const o = document.createElement("option");
  o.value = p.yol;
  o.textContent = `${p.ad}  (${p.yol})`;
  if (p.yol === boot.yol) o.selected = true;
  pageSel.appendChild(o);
}
pageSel.addEventListener("change", () => {
  if (dirty() && !confirm("Kaydedilmemiş değişiklikler var. Sayfadan çıkılsın mı?")) { pageSel.value = boot.yol; return; }
  savedStr = JSON.stringify(design); // uyarıyı tekrar gösterme
  location.href = "/admin/duzenleyici?yol=" + encodeURIComponent(pageSel.value);
});

// öge ekleme listesi
const addList = $("ed-add");
for (const t of ITEM_TIPS) {
  const li = document.createElement("li");
  li.innerHTML = `<button type="button" data-add="${t.tip}"><span class="ed-add-ico ed-ico-${t.tip}"></span><span><strong>${t.ad}</strong><small>${t.aciklama}</small></span></button>`;
  addList.appendChild(li);
}
addList.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-add]");
  if (b) addItem(b.dataset.add as ItemTip | "bolum");
});

// sekmeler
root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) =>
  b.addEventListener("click", () => {
    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $("tab-ekle").hidden = b.dataset.tab !== "ekle";
    $("tab-katman").hidden = b.dataset.tab !== "katman";
  }),
);

// görünüm
root.querySelectorAll<HTMLButtonElement>("[data-vp]").forEach((b) =>
  b.addEventListener("click", () => {
    bp = b.dataset.vp as Bp;
    root.querySelectorAll<HTMLButtonElement>("[data-vp]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    fit();
    setTimeout(() => { overlay(); panel(); }, 60);
  }),
);
function fit() {
  const w = VW[bp];
  const avail = canvas.clientWidth - 48;
  const scale = Math.min(1, avail / w);
  const hgt = (canvas.clientHeight - 32) / scale;
  frame.style.width = w + "px";
  frame.style.height = hgt + "px";
  frame.style.transform = `scale(${scale})`;
  stage.style.width = w * scale + "px";
  stage.style.height = hgt * scale + "px";
}
addEventListener("resize", () => { fit(); overlay(); });

// geçmiş
$("ed-undo").addEventListener("click", undo);
$("ed-redo").addEventListener("click", redo);
function undo() { if (hi > 0) { hi--; design = JSON.parse(hist[hi]); render(); ui(); } }
function redo() { if (hi < hist.length - 1) { hi++; design = JSON.parse(hist[hi]); render(); ui(); } }
function keys(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save("taslak"); }
  else if ((e.key === "Delete" || e.key === "Backspace") && sel && !typing) { e.preventDefault(); removeSel(); }
  else if (e.key === "Escape" && !typing) { select(null); }
}
addEventListener("keydown", keys);

// kaydet / yayınla / önizle
$("ed-save").addEventListener("click", () => save("taslak"));
$("ed-publish").addEventListener("click", () => save("yayinla"));
$("ed-preview").addEventListener("click", async () => {
  if (dirty()) await save("taslak");
  open("/admin/onizle?yol=" + encodeURIComponent(boot.yol), "_blank", "noopener");
});
async function save(islem: "taslak" | "yayinla") {
  if (islem === "yayinla" && !confirm("Değişiklikler gerçek sitede yayınlansın mı?")) return;
  prune();
  status("Kaydediliyor…");
  try {
    const r = await fetch("/admin/tasarim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ yol: boot.yol, islem, tasarim: design }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Kaydedilemedi");
    savedStr = JSON.stringify(design);
    if (islem === "yayinla") publishedStr = savedStr;
    status(islem === "yayinla" ? "Yayınlandı ✓" : "Taslak kaydedildi ✓", true);
  } catch (err) {
    status("Hata: " + (err as Error).message, true);
  }
  ui();
}
let stT = 0;
function status(t: string, flash = false) {
  statusEl.textContent = t;
  clearTimeout(stT);
  if (flash) stT = window.setTimeout(ui, 2600);
}
addEventListener("beforeunload", (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });

function ui() {
  ($("ed-undo") as HTMLButtonElement).disabled = hi <= 0;
  ($("ed-redo") as HTMLButtonElement).disabled = hi >= hist.length - 1;
  const cur = JSON.stringify(design);
  statusEl.textContent = dirty() ? "Kaydedilmemiş değişiklikler" : cur !== publishedStr ? "Taslak kaydedildi · yayında değil" : "Yayındakiyle aynı";
  statusEl.dataset.state = dirty() ? "dirty" : cur !== publishedStr ? "draft" : "ok";
  layers();
}

// ------------------------------------------------------------------ canlı alan
async function init() {
  const r = await fetch("/admin/onizle?ham=1&yol=" + encodeURIComponent(boot.yol));
  base = await r.text();
  frame.addEventListener("load", () => {
    const d = fdoc();
    const s = d.createElement("style");
    s.id = "ed-frame-css";
    s.textContent = FRAME_CSS;
    d.head.appendChild(s);
    d.addEventListener("click", onClick, true);
    d.addEventListener("submit", (e) => e.preventDefault(), true);
    d.addEventListener("mouseover", onHover, true);
    d.addEventListener("keydown", keys);
    d.addEventListener("scroll", () => overlay(), { passive: true });
    frame.contentWindow!.addEventListener("resize", () => overlay());
    render();
  });
  frame.src = "/admin/onizle?ham=1&yol=" + encodeURIComponent(boot.yol);
  fit();
  ui();
  panel();
}

/** Tüm ana içeriği taslakla yeniden üretir (Worker ile birebir aynı çıktı). */
function render() {
  const d = fdoc();
  if (!d?.body || !base) return;
  const html = applyDesign(base, design, { stripScripts: true });
  const nd = new DOMParser().parseFromString(html, "text/html");
  const newMain = nd.querySelector("main");
  const oldMain = d.querySelector("main");
  if (newMain && oldMain) oldMain.replaceWith(d.importNode(newMain, true));
  elOf(sel)?.classList.add("ed-sel");
  css();
  overlay();
  panel();
  layers();
}
function css() {
  const d = fdoc();
  if (!d?.head) return;
  let s = d.getElementById("brif-tasarim") as HTMLStyleElement | null;
  if (!s) { s = d.createElement("style"); s.id = "brif-tasarim"; d.head.appendChild(s); }
  s.textContent = designCss(design);
  requestAnimationFrame(overlay);
}
const elOf = (id: string | null) => (id ? (fdoc()?.querySelector(`[data-e="${CSS.escape(id)}"]`) as HTMLElement | null) : null);
const kindOf = (el: HTMLElement | null) => el?.dataset.k || "";
const isCustom = (id: string) => id.startsWith("c-");
const blockOf = (el: HTMLElement | null) => el?.closest<HTMLElement>("[data-blok]") || null;

function onHover(e: Event) {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-e]");
  fdoc().querySelectorAll(".ed-hov").forEach((x) => x.classList.remove("ed-hov"));
  if (t && t.dataset.e !== sel) t.classList.add("ed-hov");
}
function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest("#ed-ov")) return;
  e.preventDefault();
  e.stopPropagation();
  let t = target.closest<HTMLElement>("[data-e]");
  if (e.altKey) t = blockOf(t);
  select(t?.dataset.e || null);
}
function select(id: string | null) {
  sel = id;
  fdoc()?.querySelectorAll(".ed-sel").forEach((x) => x.classList.remove("ed-sel"));
  const el = elOf(id);
  el?.classList.add("ed-sel");
  overlay();
  panel();
  layers();
}

// ------------------------------------------------------------------ seçim çerçevesi, araç çubuğu, tutamaçlar
function ovRoot() {
  const d = fdoc();
  let o = d.getElementById("ed-ov");
  if (!o) {
    o = d.createElement("div");
    o.id = "ed-ov";
    o.innerHTML = `<div class="ed-ov-box"></div><div class="ed-ov-bar"><span class="ed-ov-name"></span>
<button type="button" data-a="drag" title="Sürükleyerek taşı" class="ed-ov-drag">⠿</button>
<button type="button" data-a="up" title="Yukarı / öne taşı">↑</button><button type="button" data-a="down" title="Aşağı / arkaya taşı">↓</button>
<button type="button" data-a="parent" title="Üst ögeyi seç">⤒</button><button type="button" data-a="dup" title="Çoğalt">⧉</button><button type="button" data-a="del" title="Sil">🗑</button></div>
<span class="ed-h ed-h-e" data-h="e"></span><span class="ed-h ed-h-s" data-h="s"></span><span class="ed-h ed-h-se" data-h="se"></span><div class="ed-size"></div>`;
    d.body.appendChild(o);
    o.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-a]");
      if (!b || b.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const a = b.dataset.a;
      if (a === "up") move(-1);
      else if (a === "down") move(1);
      else if (a === "parent") { const p = elOf(sel)?.parentElement?.closest<HTMLElement>("[data-e]"); if (p) select(p.dataset.e!); }
      else if (a === "dup") duplicate();
      else if (a === "del") removeSel();
    });
    o.querySelector<HTMLElement>(".ed-ov-drag")!.addEventListener("pointerdown", startDrag);
    o.querySelectorAll<HTMLElement>(".ed-h").forEach((h) => h.addEventListener("pointerdown", startResize));
  }
  return o;
}
function overlay() {
  const d = fdoc();
  if (!d?.body) return;
  const o = ovRoot();
  const el = elOf(sel);
  if (!el || !el.isConnected) { o.style.display = "none"; return; }
  o.style.display = "block";
  const r = el.getBoundingClientRect();
  const sx = d.defaultView!.scrollX, sy = d.defaultView!.scrollY;
  const box = o.querySelector<HTMLElement>(".ed-ov-box")!;
  Object.assign(box.style, { left: r.left + sx + "px", top: r.top + sy + "px", width: r.width + "px", height: r.height + "px" });
  const bar = o.querySelector<HTMLElement>(".ed-ov-bar")!;
  const barTop = r.top + sy - 34 < sy ? r.bottom + sy + 6 : r.top + sy - 34;
  Object.assign(bar.style, { left: Math.max(sx + 4, r.left + sx) + "px", top: barTop + "px" });
  const k = kindOf(el);
  const id = sel!;
  o.querySelector(".ed-ov-name")!.textContent = (KIND_LABEL[k] || "Öge") + (isCustom(id) ? " · yeni" : "");
  const movable = !!movableOf(el);
  bar.querySelectorAll<HTMLButtonElement>("[data-a=up],[data-a=down],[data-a=drag]").forEach((b) => (b.disabled = !movable));
  const dupBtn = bar.querySelector<HTMLButtonElement>("[data-a=dup]")!;
  const canDup = isCustom(id) && (k === "blok" || k === "item");
  dupBtn.disabled = !canDup;
  dupBtn.title = canDup ? "Çoğalt" : "Sitedeki mevcut ögeler çoğaltılamaz; soldan yeni öge ekleyebilirsin";
  const hs = { e: o.querySelector<HTMLElement>("[data-h=e]")!, s: o.querySelector<HTMLElement>("[data-h=s]")!, se: o.querySelector<HTMLElement>("[data-h=se]")! };
  const resizable = k !== "blok" && k !== "l";
  for (const [key, h] of Object.entries(hs)) {
    h.style.display = resizable ? "block" : "none";
    const x = key === "s" ? r.left + r.width / 2 : r.right;
    const y = key === "e" ? r.top + r.height / 2 : r.bottom;
    h.style.left = x + sx - 6 + "px";
    h.style.top = y + sy - 6 + "px";
  }
}

// ------------------------------------------------------------------ taşıma
function siblingsOf(el: HTMLElement): HTMLElement[] {
  if (kindOf(el) === "blok") return [...fdoc().querySelectorAll<HTMLElement>("main > [data-blok]")];
  const p = el.parentElement;
  if (!p || kindOf(p) !== "l") return [];
  return [...p.children].filter((c): c is HTMLElement => (c as HTMLElement).dataset?.e !== undefined) as HTMLElement[];
}
function canMove(el: HTMLElement) { return siblingsOf(el).length > 1; }
/** Taşınacak öge: kendisi ya da içinde bulunduğu kart / liste ögesi */
function movableOf(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  if (canMove(el)) return el;
  const it = el.parentElement?.closest<HTMLElement>('[data-k="item"]');
  return it && canMove(it) ? it : null;
}
/** Görsel sıraya göre (CSS order dahil) kardeşler */
function visualOrder(sibs: HTMLElement[]) {
  return [...sibs].sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left;
  });
}
function applyOrder(el: HTMLElement, ordered: HTMLElement[]) {
  const k = kindOf(el);
  if (k === "blok") {
    design.bloklar = ordered.map((b) => b.dataset.blok!);
  } else {
    const p = el.parentElement!;
    const pid = p.dataset.e!;
    if (pid.endsWith(".g") && isCustom(pid)) {
      const bid = pid.slice(0, -2);
      const b = design.ozel?.[bid];
      if (b) {
        const byId = new Map(b.items.map((it) => [`${bid}.${it.id}`, it]));
        b.items = ordered.map((x) => byId.get(x.dataset.e!)!).filter(Boolean);
      }
    } else {
      // mevcut liste: yalnızca bu ekran boyutunda sıra değişir
      ordered.forEach((x, i) => (st(x.dataset.e!).o = i));
    }
  }
  commit();
}
function move(dir: number) {
  const el = movableOf(elOf(sel));
  if (!el) return;
  const sibs = visualOrder(siblingsOf(el));
  const i = sibs.indexOf(el);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return;
  sibs.splice(i, 1);
  sibs.splice(j, 0, el);
  applyOrder(el, sibs);
}
function startDrag(e: PointerEvent) {
  const el = movableOf(elOf(sel));
  if (!el) return;
  e.preventDefault();
  const d = fdoc();
  const sibs = visualOrder(siblingsOf(el));
  const guide = d.createElement("div");
  guide.className = "ed-guide";
  ovRoot().appendChild(guide);
  el.classList.add("ed-dragging");
  const vertical = kindOf(el) === "blok";
  let target = sibs.indexOf(el);
  const onMove = (ev: PointerEvent) => {
    const sx = d.defaultView!.scrollX, sy = d.defaultView!.scrollY;
    // kenara yaklaşınca kaydır
    const vh = d.defaultView!.innerHeight;
    if (ev.clientY < 60) d.defaultView!.scrollBy(0, -18); else if (ev.clientY > vh - 60) d.defaultView!.scrollBy(0, 18);
    let best = 0, bestD = Infinity, after = false;
    sibs.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dist = vertical ? Math.abs(ev.clientY - cy) : Math.hypot(ev.clientX - cx, ev.clientY - cy);
      if (dist < bestD) { bestD = dist; best = i; after = vertical || ev.clientY > r.bottom || ev.clientY < r.top ? ev.clientY > cy : ev.clientX > cx; }
    });
    const r = sibs[best].getBoundingClientRect();
    const sameRow = !vertical && ev.clientY >= r.top && ev.clientY <= r.bottom;
    if (vertical || !sameRow) Object.assign(guide.style, { left: r.left + sx + "px", top: (after ? r.bottom : r.top) + sy - 2 + "px", width: r.width + "px", height: "4px" });
    else Object.assign(guide.style, { left: (after ? r.right : r.left) + sx - 2 + "px", top: r.top + sy + "px", width: "4px", height: r.height + "px" });
    target = best + (after ? 1 : 0);
  };
  const onUp = () => {
    d.removeEventListener("pointermove", onMove);
    d.removeEventListener("pointerup", onUp);
    guide.remove();
    el.classList.remove("ed-dragging");
    const i = sibs.indexOf(el);
    const list = sibs.filter((x) => x !== el);
    const at = target > i ? target - 1 : target;
    list.splice(at, 0, el);
    if (list.some((x, k) => x !== sibs[k])) applyOrder(el, list);
  };
  d.addEventListener("pointermove", onMove);
  d.addEventListener("pointerup", onUp);
}

// ------------------------------------------------------------------ boyutlandırma (ızgara ve 8px kılavuzlu)
function startResize(e: PointerEvent) {
  const el = elOf(sel);
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const d = fdoc();
  const h = (e.target as HTMLElement).dataset.h!;
  const r0 = el.getBoundingClientRect();
  const x0 = e.clientX, y0 = e.clientY;
  const id = sel!;
  const k = kindOf(el);
  const parent = el.parentElement!;
  const pr = parent.getBoundingClientRect();
  const customGrid = k === "item" && isCustom(id);
  const sizeTip = ovRoot().querySelector<HTMLElement>(".ed-size")!;
  const guides = d.createElement("div");
  guides.className = "ed-cols";
  ovRoot().appendChild(guides);
  const sx = d.defaultView!.scrollX, sy = d.defaultView!.scrollY;
  let gap = 0, colW = 0;
  if (customGrid) {
    const cs = getComputedStyle(parent);
    gap = parseFloat(cs.columnGap) || 0;
    const cols = cs.gridTemplateColumns.split(" ").length || 12;
    colW = (pr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - gap * (cols - 1)) / cols;
    const left = pr.left + parseFloat(cs.paddingLeft);
    guides.innerHTML = Array.from({ length: cols }, (_, i) => `<span style="left:${left + sx + i * (colW + gap)}px;top:${pr.top + sy}px;width:${colW}px;height:${pr.height}px"></span>`).join("");
  } else {
    guides.innerHTML = [pr.left, pr.left + pr.width / 2, pr.right].map((x) => `<i style="left:${x + sx}px;top:${pr.top + sy}px;height:${pr.height}px"></i>`).join("");
  }
  const s = st(id);
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (h === "e" || h === "se") {
      const w = Math.max(24, r0.width + dx);
      if (customGrid) {
        s.cols = Math.max(1, Math.min(12, Math.round((w + gap) / (colW + gap))));
        sizeTip.textContent = `${s.cols} / 12 kolon`;
      } else {
        let px = Math.round(w / 8) * 8;
        if (Math.abs(w - pr.width) < 12) { s.w = "100%"; sizeTip.textContent = "Tam genişlik"; }
        else { px = Math.min(px, Math.round(pr.width)); s.w = px + "px"; sizeTip.textContent = px + " px"; }
      }
    }
    if (h === "s" || h === "se") {
      const hh = Math.max(16, Math.round((r0.height + dy) / 8) * 8);
      if (k === "img") s.h = hh + "px"; else s.mh = hh + "px";
      sizeTip.textContent = (sizeTip.textContent && h === "se" ? sizeTip.textContent + " × " : "") + hh + " px";
    }
    const rr = el.getBoundingClientRect();
    Object.assign(sizeTip.style, { display: "block", left: rr.right + sx + 8 + "px", top: rr.bottom + sy + 8 + "px" });
    css();
  };
  const onUp = () => {
    d.removeEventListener("pointermove", onMove);
    d.removeEventListener("pointerup", onUp);
    guides.remove();
    sizeTip.style.display = "none";
    commit(false);
    panel();
  };
  d.addEventListener("pointermove", onMove);
  d.addEventListener("pointerup", onUp);
}

// ------------------------------------------------------------------ ekleme, çoğaltma, silme
function addItem(tip: ItemTip | "bolum") {
  design.ozel ||= {};
  const cur = elOf(sel);
  const curBlock = blockOf(cur);
  let bid = curBlock && isCustom(curBlock.dataset.blok!) && tip !== "bolum" ? curBlock.dataset.blok! : "";
  if (!bid) {
    bid = uid("c-");
    design.ozel[bid] = { items: [] };
    // seçili bölümün altına yerleştir
    const order = [...fdoc().querySelectorAll<HTMLElement>("main > [data-blok]")].map((b) => b.dataset.blok!);
    const at = curBlock ? order.indexOf(curBlock.dataset.blok!) + 1 : order.length;
    order.splice(at, 0, bid);
    design.bloklar = order;
  }
  let newSel = bid;
  if (tip !== "bolum") {
    const items = design.ozel[bid].items;
    const it = { id: uid("i-"), tip };
    const curItem = cur?.closest<HTMLElement>('[data-k="item"]');
    const idx = curItem ? items.findIndex((x) => `${bid}.${x.id}` === curItem.dataset.e) : -1;
    items.splice(idx >= 0 ? idx + 1 : items.length, 0, it);
    const iid = `${bid}.${it.id}`;
    st(iid, "d").cols = DEFAULT_COLS[tip];
    if (DEFAULT_COLS[tip] < 12) st(iid, "t").cols = DEFAULT_COLS[tip] <= 4 ? 6 : 12;
    const main: Partial<Record<ItemTip, string>> = { baslik: ".h", metin: ".p", gorsel: ".img", buton: ".btn" };
    newSel = iid + (main[tip] || "");
  }
  commit();
  select(newSel);
  elOf(newSel)?.scrollIntoView({ block: "center", behavior: "smooth" });
}
function duplicate() {
  const id = sel;
  if (!id || !isCustom(id)) return;
  const el = elOf(id);
  const k = kindOf(el);
  const copyOv = (from: string, to: string) => {
    for (const [key, v] of Object.entries(design.el || {})) if (key === from || key.startsWith(from + ".")) design.el![to + key.slice(from.length)] = clone(v);
  };
  if (k === "blok") {
    const nb = uid("c-");
    design.ozel![nb] = clone(design.ozel![id]);
    copyOv(id, nb);
    const order = [...fdoc().querySelectorAll<HTMLElement>("main > [data-blok]")].map((b) => b.dataset.blok!);
    order.splice(order.indexOf(id) + 1, 0, nb);
    design.bloklar = order;
    commit();
    select(nb);
  } else if (k === "item") {
    const bid = id.split(".")[0];
    const items = design.ozel![bid].items;
    const i = items.findIndex((x) => `${bid}.${x.id}` === id);
    const it = { id: uid("i-"), tip: items[i].tip };
    items.splice(i + 1, 0, it);
    copyOv(id, `${bid}.${it.id}`);
    commit();
    select(`${bid}.${it.id}`);
  }
}
function removeSel() {
  const id = sel;
  if (!id) return;
  const el = elOf(id);
  const k = kindOf(el);
  if (isCustom(id) && k === "blok") {
    delete design.ozel![id];
    design.bloklar = (design.bloklar || []).filter((x) => x !== id);
    for (const key of Object.keys(design.el || {})) if (key === id || key.startsWith(id + ".")) delete design.el![key];
  } else if (isCustom(id) && k === "item") {
    const bid = id.split(".")[0];
    design.ozel![bid].items = design.ozel![bid].items.filter((x) => `${bid}.${x.id}` !== id);
    for (const key of Object.keys(design.el || {})) if (key === id || key.startsWith(id + ".")) delete design.el![key];
  } else {
    ov(id).x = true; // mevcut ögeler sitede kaldırılır (geri alınabilir)
  }
  const parent = el?.parentElement?.closest<HTMLElement>("[data-e]");
  commit();
  select(parent && elOf(parent.dataset.e!) ? parent.dataset.e! : null);
}

// ------------------------------------------------------------------ bölümler paneli
function blockName(b: HTMLElement) {
  const h = b.querySelector("h1, h2, h3, .tag");
  const t = (h?.textContent || "").trim().replace(/\s+/g, " ");
  return t ? (t.length > 34 ? t.slice(0, 34) + "…" : t) : b.dataset.blok!;
}
function layers() {
  const ol = $("ed-layers");
  const d = fdoc();
  if (!d?.body) return;
  const blocks = [...d.querySelectorAll<HTMLElement>("main > [data-blok]")];
  const removed = Object.entries(design.el || {}).filter(([id, o]) => o.x && !id.includes(".") && !isCustom(id)).map(([id]) => id);
  const selBlock = blockOf(elOf(sel))?.dataset.blok;
  ol.innerHTML =
    blocks.map((b) => `<li draggable="true" data-id="${b.dataset.blok}"${b.dataset.blok === selBlock ? ' aria-current="true"' : ""}><span class="ed-grip">⠿</span><span class="ed-lname">${esc(blockName(b))}</span>${isCustom(b.dataset.blok!) ? '<span class="ed-new">yeni</span>' : ""}</li>`).join("") +
    removed.map((id) => `<li class="ed-removed"><span class="ed-lname">${esc(id)} (kaldırıldı)</span><button type="button" data-restore="${esc(id)}">Geri getir</button></li>`).join("");
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
{
  const ol = $("ed-layers");
  let dragId = "";
  ol.addEventListener("click", (e) => {
    const r = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-restore]");
    if (r) { delete ov(r.dataset.restore!).x; commit(); return; }
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-id]");
    if (li) { select(li.dataset.id!); elOf(li.dataset.id!)?.scrollIntoView({ block: "start", behavior: "smooth" }); }
  });
  ol.addEventListener("dragstart", (e) => { dragId = (e.target as HTMLElement).closest<HTMLElement>("li")?.dataset.id || ""; e.dataTransfer?.setData("text/plain", dragId); });
  ol.addEventListener("dragover", (e) => {
    e.preventDefault();
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-id]");
    ol.querySelectorAll(".ed-drop").forEach((x) => x.classList.remove("ed-drop"));
    li?.classList.add("ed-drop");
  });
  ol.addEventListener("drop", (e) => {
    e.preventDefault();
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-id]");
    if (!li || !dragId || li.dataset.id === dragId) return;
    const order = [...ol.querySelectorAll<HTMLElement>("li[data-id]")].map((x) => x.dataset.id!).filter((x) => x !== dragId);
    const r = li.getBoundingClientRect();
    const at = order.indexOf(li.dataset.id!) + (e.clientY > r.top + r.height / 2 ? 1 : 0);
    order.splice(at, 0, dragId);
    design.bloklar = order;
    commit();
  });
}

// ------------------------------------------------------------------ özellikler paneli
function panel() {
  const el = elOf(sel);
  if (!sel || !el) {
    props.innerHTML = `<div class="ed-empty"><h2>Bir öge seç</h2><p>Canlı alanda bir metne, görsele, butona ya da karta tıkla. Bütün bir bölümü seçmek için <kbd>Alt</kbd> + tıkla veya soldaki <b>Bölümler</b> listesini kullan.</p><p>Stil ayarları seçili görünüme (<b>${BP_LABEL[bp]}</b>) uygulanır; diğer ekran boyutları etkilenmez.</p></div>`;
    return;
  }
  const id = sel;
  const k = kindOf(el);
  const o: ElOv = design.el?.[id] || {};
  const s = (o.s?.[bp] || {}) as Style;
  const cs = getComputedStyle(el);
  const leaf = el.children.length === 0;
  const parts: string[] = [];
  parts.push(`<header class="ed-ph"><span class="ed-kind">${KIND_LABEL[k] || "Öge"}</span><code>${esc(id)}</code></header>`);

  // --- içerik
  const content: string[] = [];
  if (["h", "p", "t", "btn"].includes(k) || (k === "item" && leaf)) {
    if (leaf) content.push(field("Metin", `<textarea data-f="t" rows="${k === "p" ? 5 : 2}">${esc(o.t ?? el.textContent ?? "")}</textarea>`));
    else content.push(`<p class="ed-hint">Bu öge iç içe içerik barındırıyor (ör. bağlantılı metin). Metni alt ögelerden düzenle; burada stilini değiştirebilirsin.</p>`);
  }
  if (k === "btn" || (el.tagName === "A" && k === "t")) content.push(field("Bağlantı", `<input data-f="href" value="${esc(o.href ?? el.getAttribute("href") ?? "")}" placeholder="/talep-olustur veya https://…">`));
  if (k === "img") {
    const img = el.tagName === "IMG" ? (el as HTMLImageElement) : el.querySelector("img");
    content.push(`<div class="ed-imgbox">${img ? `<img src="${esc(img.getAttribute("src") || "")}" alt="">` : `<span>${esc(el.querySelector(".ph-n")?.textContent || "Görsel yok")}</span>`}</div>
<div class="ed-row"><button type="button" class="ed-btn ed-primary" data-act="media">${img ? "Görseli değiştir" : "Görsel seç"}</button>${o.src ? '<button type="button" class="ed-btn" data-act="unimg">Kaldır</button>' : ""}</div>`);
    content.push(field("Alternatif metin (alt)", `<input data-f="alt" maxlength="200" value="${esc(o.alt ?? img?.getAttribute("alt") ?? "")}" placeholder="Görseli kısaca tarif et">`));
  }
  if (content.length) parts.push(group("İçerik", content.join("")));

  // --- stil (görünüme özel)
  const style: string[] = [];
  const textual = ["h", "p", "t", "btn"].includes(k) || (k === "item" && leaf);
  if (textual) {
    style.push(`<div class="ed-grid2">${field("Yazı boyutu", num("fs", s.fs, parseFloat(cs.fontSize), "px"))}${field("Kalınlık", `<select data-s="fw"><option value="">Varsayılan</option>${[400, 500, 700].map((w) => `<option value="${w}"${s.fw === w ? " selected" : ""}>${w === 400 ? "Normal" : w === 500 ? "Orta" : "Kalın"}</option>`).join("")}</select>`)}</div>`);
    style.push(field("Yazı rengi", color("c", s.c, cs.color)));
    style.push(field("Hizalama", seg("ta", s.ta, [["left", "Sol"], ["center", "Orta"], ["right", "Sağ"]])));
  }
  if (k === "btn") style.push(field("Arka plan", color("bg", s.bg, cs.backgroundColor)), field("Köşe yuvarlaklığı", num("r", s.r, parseFloat(cs.borderTopLeftRadius), "px")));
  if (k === "img") {
    style.push(field("Kırpma oranı", `<select data-s="ar"><option value="">Serbest</option>${["1/1", "4/5", "3/4", "4/3", "3/2", "16/9", "21/9", "9/16"].map((r) => `<option${s.ar === r ? " selected" : ""}>${r}</option>`).join("")}</select>`));
    const [px, py] = (s.pos || "50% 50%").split(" ").map((v) => parseInt(v));
    style.push(`<div class="ed-grid2">${field("Odak yatay", `<input type="range" min="0" max="100" data-pos="x" value="${px}">`)}${field("Odak dikey", `<input type="range" min="0" max="100" data-pos="y" value="${py}">`)}</div>`);
    style.push(field("Sığdırma", seg("fit", s.fit, [["cover", "Doldur (kırp)"], ["contain", "Sığdır"]])));
    style.push(`<div class="ed-grid2">${field("Genişlik", txtIn("w", s.w, Math.round(el.getBoundingClientRect().width) + "px"))}${field("Yükseklik", txtIn("h", s.h, Math.round(el.getBoundingClientRect().height) + "px"))}</div>`);
    style.push(field("Köşe yuvarlaklığı", num("r", s.r, parseFloat(cs.borderTopLeftRadius), "px")));
  }
  if (["item", "box", "blok", "l"].includes(k)) {
    style.push(field("Arka plan", color("bg", s.bg, cs.backgroundColor)));
    if (k === "item" && isCustom(id)) style.push(field(`Genişlik (12 kolon ızgarada)`, `<input type="range" min="1" max="12" data-s="cols" value="${s.cols ?? 12}"><output>${s.cols ?? "otomatik"}</output>`));
    else if (k !== "blok") style.push(field("Genişlik", txtIn("w", s.w, "otomatik")));
    style.push(field("En az yükseklik", txtIn("mh", s.mh, "otomatik")));
    style.push(field("Köşe yuvarlaklığı", num("r", s.r, parseFloat(cs.borderTopLeftRadius), "px")));
    if (k !== "l") style.push(field("Metin hizası", seg("ta", s.ta, [["left", "Sol"], ["center", "Orta"], ["right", "Sağ"]])));
  }
  if (k !== "l") {
    style.push(field("İç boşluk (üst sağ alt sol)", box4("p", s.p, cs.padding)));
    style.push(field("Dış boşluk (üst sağ alt sol)", box4("m", s.m, cs.margin)));
  }
  style.push(`<label class="ed-check"><input type="checkbox" data-s="hide"${s.hide ? " checked" : ""}> ${BP_LABEL[bp]} görünümünde gizle</label>`);
  style.push(`<button type="button" class="ed-link" data-act="reset">${BP_LABEL[bp]} stillerini sıfırla</button>`);
  parts.push(group(`Stil <span class="ed-bp">${BP_LABEL[bp]}</span>`, style.join("")));

  // --- işlemler
  const acts: string[] = [];
  if (isCustom(id) && (k === "blok" || k === "item")) acts.push(`<button type="button" class="ed-btn" data-act="dup">Çoğalt</button>`);
  acts.push(`<button type="button" class="ed-btn ed-danger" data-act="del">${isCustom(id) ? "Sil" : "Sitede kaldır"}</button>`);
  parts.push(`<div class="ed-row ed-acts">${acts.join("")}</div>`);
  props.innerHTML = parts.join("");
}
const field = (label: string, input: string) => `<label class="ed-field"><span>${label}</span>${input}</label>`;
const group = (title: string, body: string) => `<section class="ed-group"><h3>${title}</h3>${body}</section>`;
const num = (k: string, v: number | undefined, ph: number, unit: string) => `<span class="ed-unit"><input type="number" data-s="${k}" value="${v ?? ""}" placeholder="${Math.round(ph) || ""}" min="0" max="400"><em>${unit}</em></span>`;
const txtIn = (k: string, v: string | undefined, ph: string) => `<input data-s="${k}" value="${esc(v ?? "")}" placeholder="${esc(ph)}">`;
function color(k: string, v: string | undefined, cur: string) {
  const hex = v || rgbHex(cur) || "#191919";
  return `<span class="ed-color"><input type="color" data-s="${k}" value="${hex}"><span class="ed-sw">${SWATCH.map((c) => `<button type="button" data-sw="${k}" data-c="${c}" style="background:${c}" title="${c}"></button>`).join("")}</span>${v ? `<button type="button" class="ed-link" data-clear="${k}">Sıfırla</button>` : ""}</span>`;
}
function seg(k: string, v: string | undefined, opts: [string, string][]) {
  return `<span class="ed-seg">${opts.map(([val, l]) => `<button type="button" data-seg="${k}" data-v="${val}" aria-pressed="${v === val}">${l}</button>`).join("")}</span>`;
}
function box4(k: string, v: string | undefined, cur: string) {
  const vals = (v || "").split(" ");
  const ph = cur.split(" ").map((x) => String(Math.round(parseFloat(x) || 0)));
  const full = [0, 1, 2, 3].map((i) => vals[i] ?? (vals.length === 1 ? vals[0] : vals.length === 2 ? vals[i % 2] : ""));
  const phf = [0, 1, 2, 3].map((i) => ph[i] ?? (ph.length === 1 ? ph[0] : ph.length === 2 ? ph[i % 2] : ph[1] || "0"));
  return `<span class="ed-box4">${[0, 1, 2, 3].map((i) => `<input type="number" data-box="${k}" data-i="${i}" value="${full[i] ?? ""}" placeholder="${phf[i]}">`).join("")}</span>`;
}
function rgbHex(c: string) {
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m || m[4] === "0") return "";
  return "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("");
}

// panel olayları
let textT = 0;
props.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (!sel) return;
  const el = elOf(sel);
  if (t.dataset.f === "t") {
    ov(sel).t = t.value;
    if (el) el.textContent = t.value;
    clearTimeout(textT);
    textT = window.setTimeout(() => commit(false), 500);
    overlay();
    return;
  }
  if (t.dataset.f === "href" || t.dataset.f === "alt") {
    ov(sel)[t.dataset.f as "href" | "alt"] = t.value;
    clearTimeout(textT);
    textT = window.setTimeout(() => commit(true), 600);
    return;
  }
  const s = st(sel);
  if (t.dataset.s) {
    const k = t.dataset.s as keyof Style;
    if (k === "hide") (s as any).hide = (t as HTMLInputElement).checked || undefined;
    else if (t.type === "number" || t.type === "range") (s as any)[k] = t.value === "" ? undefined : Number(t.value);
    else if (k === "w" || k === "h" || k === "mh") (s as any)[k] = normSize(t.value, k !== "w");
    else (s as any)[k] = t.value || undefined;
    if (k === "cols" && t.nextElementSibling) t.nextElementSibling.textContent = t.value;
    css();
    clearTimeout(textT);
    textT = window.setTimeout(() => commit(false), 400);
  }
  if (t.dataset.box) {
    const inputs = [...props.querySelectorAll<HTMLInputElement>(`[data-box="${t.dataset.box}"]`)];
    const vals = inputs.map((i) => (i.value === "" ? i.placeholder || "0" : String(Math.round(Number(i.value)))));
    (s as any)[t.dataset.box] = inputs.every((i) => i.value === "") ? undefined : vals.join(" ");
    css();
    clearTimeout(textT);
    textT = window.setTimeout(() => commit(false), 400);
  }
  if (t.dataset.pos) {
    const x = props.querySelector<HTMLInputElement>("[data-pos=x]")!.value, y = props.querySelector<HTMLInputElement>("[data-pos=y]")!.value;
    s.pos = `${x}% ${y}%`;
    s.fit ||= "cover";
    css();
    clearTimeout(textT);
    textT = window.setTimeout(() => commit(false), 400);
  }
});
props.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (!sel || t.tagName !== "SELECT" || !t.dataset.s) return;
  const s = st(sel);
  const k = t.dataset.s as keyof Style;
  (s as any)[k] = t.value === "" ? undefined : k === "fw" ? Number(t.value) : t.value;
  commit(false);
});
props.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b || !sel) return;
  const s = st(sel);
  if (b.dataset.seg) {
    const k = b.dataset.seg as keyof Style;
    (s as any)[k] = (s as any)[k] === b.dataset.v ? undefined : b.dataset.v;
    commit(false);
    panel();
  } else if (b.dataset.sw) {
    (s as any)[b.dataset.sw] = b.dataset.c;
    commit(false);
    panel();
  } else if (b.dataset.clear) {
    delete (s as any)[b.dataset.clear];
    commit(false);
    panel();
  } else if (b.dataset.act === "reset") {
    if (design.el?.[sel]?.s) delete design.el[sel].s![bp];
    commit(false);
    panel();
  } else if (b.dataset.act === "media") openMedia();
  else if (b.dataset.act === "unimg") { delete ov(sel).src; commit(); }
  else if (b.dataset.act === "dup") duplicate();
  else if (b.dataset.act === "del") removeSel();
});
function normSize(v: string, pxOnly: boolean): string | undefined {
  const t = v.trim().toLowerCase();
  if (!t) return undefined;
  if (t === "auto" || t === "otomatik") return pxOnly ? undefined : "auto";
  const m = t.match(/^(\d{1,4})\s*(px|%)?$/);
  if (!m) return undefined;
  if (m[2] === "%" && !pxOnly) return m[1] + "%";
  return m[1] + "px";
}

// ------------------------------------------------------------------ görsel kütüphanesi
const dlg = $<HTMLDialogElement>("ed-media");
const grid = $("ed-media-grid");
async function openMedia() {
  dlg.showModal();
  grid.innerHTML = `<li class="ed-hint">Yükleniyor…</li>`;
  const r = await fetch("/admin/medya.json");
  const d = (await r.json()) as { medya: Medya[] };
  drawMedia(d.medya);
}
function drawMedia(list: Medya[]) {
  grid.innerHTML = list.length
    ? list.map((m) => `<li><button type="button" data-pick="${m.id}" data-url="${esc(m.url)}" data-alt="${esc(m.alt)}"><img src="${esc(m.url)}" alt="" loading="lazy"></button><span>${esc(m.ad)}</span></li>`).join("")
    : `<li class="ed-hint">Henüz görsel yok. Bilgisayardan yükleyerek başla.</li>`;
}
grid.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pick]");
  if (!b || !sel) return;
  const o = ov(sel);
  o.src = b.dataset.url!;
  if (!o.alt && b.dataset.alt) o.alt = b.dataset.alt;
  dlg.close();
  commit();
});
$<HTMLInputElement>("ed-file").addEventListener("change", async (e) => {
  const inp = e.target as HTMLInputElement;
  let f = inp.files?.[0];
  if (!f) return;
  const msg = $("ed-upmsg");
  msg.textContent = "Yükleniyor…";
  try {
    if (f.size > 1_400_000) f = await shrink(f);
    const fd = new FormData();
    fd.append("dosya", f);
    const r = await fetch("/admin/medya", { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Yüklenemedi");
    msg.textContent = d.tekrar ? "Bu görsel zaten kütüphanede; mevcut olan seçildi." : "Yüklendi ✓";
    const l = await (await fetch("/admin/medya.json")).json();
    drawMedia(l.medya);
  } catch (err) {
    msg.textContent = "Hata: " + (err as Error).message;
  }
  inp.value = "";
});
async function shrink(f: File): Promise<File> {
  const bmp = await createImageBitmap(f);
  let max = 2400;
  for (let i = 0; i < 7; i++) {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.85));
    if (b && b.size <= 1_400_000) return new File([b], f.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
    max = Math.round(max * 0.8);
  }
  throw new Error("Görsel küçültülemedi");
}

// ------------------------------------------------------------------ canlı alan stilleri
const FRAME_CSS = `
html{scroll-behavior:auto!important}
[data-e]{cursor:pointer}
.ed-hov{outline:1px dashed rgba(76,127,240,.9)!important;outline-offset:2px}
.ed-sel{outline:2px solid #77EA2F!important;outline-offset:2px}
.ed-dragging{opacity:.45}
.reveal{opacity:1!important;transform:none!important}
.cb-grid:empty{min-height:120px;border:1.5px dashed #C9CDC2;border-radius:16px}
.cb-grid:empty::before{content:"Boş bölüm — soldan öge ekle";grid-column:1/-1;align-self:center;text-align:center;color:#8A8F84;font-size:14px}
#ed-ov{position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000;font:500 12px/1 Geist,Inter,system-ui,sans-serif}
#ed-ov .ed-ov-box{position:absolute;pointer-events:none;border:1px solid transparent}
#ed-ov .ed-ov-bar{position:absolute;display:flex;align-items:center;gap:2px;background:#191919;color:#fff;border-radius:8px;padding:3px;box-shadow:0 8px 20px -8px rgba(0,0,0,.4);white-space:nowrap}
#ed-ov .ed-ov-name{padding:0 8px;color:#C8F5A8}
#ed-ov button{all:unset;cursor:pointer;width:24px;height:24px;display:grid;place-items:center;border-radius:6px;font-size:13px;color:#fff}
#ed-ov button:hover{background:#333}
#ed-ov button:disabled{opacity:.3;cursor:not-allowed}
#ed-ov .ed-ov-drag{cursor:grab;touch-action:none}
#ed-ov .ed-h{position:absolute;width:12px;height:12px;background:#77EA2F;border:2px solid #191919;border-radius:3px;touch-action:none}
#ed-ov .ed-h-e{cursor:ew-resize}#ed-ov .ed-h-s{cursor:ns-resize}#ed-ov .ed-h-se{cursor:nwse-resize}
#ed-ov .ed-guide{position:absolute;background:#77EA2F;border-radius:2px;box-shadow:0 0 0 1px #191919}
#ed-ov .ed-cols span{position:absolute;background:rgba(119,234,47,.12);border-left:1px dashed rgba(25,25,25,.25);border-right:1px dashed rgba(25,25,25,.25)}
#ed-ov .ed-cols i{position:absolute;width:0;border-left:1px dashed #4C7FF0}
#ed-ov .ed-size{position:absolute;display:none;background:#191919;color:#fff;padding:4px 7px;border-radius:6px}
`;

init();
