// Görsel Düzenleyici: paylaşılan çekirdek (Worker + editör + statik dışa aktarma).
// - annotate(): dışa aktarılan sayfalara düzenlenebilir öge kimlikleri ekler (data-blok, data-e, data-k)
// - sanitizeDesign(): editörden gelen tasarım JSON'unu doğrular (beyaz liste)
// - designCss(): kesme noktası bazlı stil kuralları (masaüstü / tablet / mobil birbirini etkilemez)
// - applyDesign(): yayınlanan tasarımı sayfa HTML'ine uygular (sıra, yeni bölümler, metin, görsel, bağlantı)
// HTML React tarafından üretildiği için (öznitelikler çift tırnaklı ve kaçışlı) hafif bir ayrıştırıcı yeterlidir.

// ------------------------------------------------------------------ türler
export type Bp = "d" | "t" | "m";
export const BPS: Bp[] = ["d", "t", "m"];
export const BP_MEDIA: Record<Bp, string> = {
  d: "(min-width: 961px)",
  t: "(min-width: 601px) and (max-width: 960px)",
  m: "(max-width: 600px)",
};
export const BP_LABEL: Record<Bp, string> = { d: "Masaüstü", t: "Tablet", m: "Mobil" };

export interface Style {
  fs?: number; // yazı boyutu px
  fw?: number; // 400 | 500 | 700
  c?: string; // yazı rengi
  bg?: string; // arka plan
  w?: string; // genişlik: 320px | 50% | auto
  h?: string; // yükseklik px (görsel)
  mh?: string; // en az yükseklik px (kutu)
  p?: string; // iç boşluk "t r b l" px
  m?: string; // dış boşluk "t r b l" px
  r?: number; // köşe px
  ta?: "left" | "center" | "right";
  o?: number; // sıra (CSS order)
  hide?: boolean;
  fit?: "cover" | "contain";
  pos?: string; // "50% 50%"
  ar?: string; // "16/9"
  cols?: number; // 1–12 kolon (yeni bölümlerdeki ögeler)
}
export interface ElOv {
  t?: string; // metin
  href?: string;
  src?: string;
  alt?: string;
  x?: boolean; // kaldırıldı
  s?: Partial<Record<Bp, Style>>;
}
export type ItemTip = "baslik" | "metin" | "gorsel" | "buton" | "gorsel-metin" | "hizmet-karti" | "kutu" | "banner";
export interface CItem { id: string; tip: ItemTip }
export interface CBlock { items: CItem[] }
export interface Design {
  v: 1;
  bloklar?: string[];
  ozel?: Record<string, CBlock>;
  el?: Record<string, ElOv>;
}

export const ITEM_TIPS: { tip: ItemTip | "bolum"; ad: string; aciklama: string }[] = [
  { tip: "baslik", ad: "Başlık", aciklama: "Büyük bölüm başlığı" },
  { tip: "metin", ad: "Metin kutusu", aciklama: "Paragraf" },
  { tip: "gorsel", ad: "Görsel", aciklama: "Kırpılabilir görsel" },
  { tip: "buton", ad: "Buton", aciklama: "Bağlantılı düğme" },
  { tip: "gorsel-metin", ad: "Görsel + metin", aciklama: "Yan yana görsel ve yazı" },
  { tip: "hizmet-karti", ad: "Hizmet kartı", aciklama: "Görsel, başlık, metin, bağlantı" },
  { tip: "kutu", ad: "İçerik kutusu", aciklama: "Çerçeveli başlık + metin" },
  { tip: "banner", ad: "Banner", aciklama: "Koyu zeminli çağrı alanı" },
  { tip: "bolum", ad: "Bölüm / Section", aciklama: "Boş bölüm" },
];
const TIP_SET = new Set(ITEM_TIPS.map((t) => t.tip).filter((t) => t !== "bolum"));
export const DEFAULT_COLS: Record<ItemTip, number> = { baslik: 12, metin: 12, gorsel: 6, buton: 12, "gorsel-metin": 12, "hizmet-karti": 4, kutu: 4, banner: 12 };

// ------------------------------------------------------------------ ayrıştırıcı
export interface HNode {
  tag: string;
  s: number; // açılış etiketinin başı
  oe: number; // açılış etiketinin sonu (">" sonrası)
  cs: number; // kapanış etiketinin başı (boş ögede = oe)
  e: number; // ögenin sonu
  attrs: string;
  kids: HNode[];
  parent: HNode | null;
}
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);

export function parseHtml(html: string): HNode {
  const root: HNode = { tag: "#root", s: 0, oe: 0, cs: html.length, e: html.length, attrs: "", kids: [], parent: null };
  const stack: HNode[] = [root];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (html[lt + 1] === "/") {
      const end = html.indexOf(">", lt);
      if (end < 0) break;
      const name = html.slice(lt + 2, end).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === name) {
          for (let j = stack.length - 1; j >= k; j--) {
            const nd = stack[j];
            if (j === k) { nd.cs = lt; nd.e = end + 1; } else { nd.cs = lt; nd.e = lt; }
          }
          stack.length = k;
          break;
        }
      }
      i = end + 1;
      continue;
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40));
    if (!m) { i = lt + 1; continue; }
    const tag = m[1].toLowerCase();
    // etiket sonu: tırnak içini atla
    let j = lt + m[0].length;
    let q = "";
    for (; j < n; j++) {
      const ch = html[j];
      if (q) { if (ch === q) q = ""; }
      else if (ch === '"' || ch === "'") q = ch;
      else if (ch === ">") break;
    }
    const oe = j + 1;
    const selfClose = html[j - 1] === "/";
    const parent = stack[stack.length - 1];
    const node: HNode = { tag, s: lt, oe, cs: oe, e: oe, attrs: html.slice(lt + m[0].length, selfClose ? j - 1 : j), kids: [], parent };
    parent.kids.push(node);
    if (VOID.has(tag) || selfClose) { i = oe; continue; }
    if (RAW.has(tag)) {
      const close = html.toLowerCase().indexOf("</" + tag, oe);
      const cEnd = close < 0 ? n : html.indexOf(">", close) + 1;
      node.cs = close < 0 ? n : close;
      node.e = cEnd;
      i = cEnd;
      continue;
    }
    stack.push(node);
    i = oe;
  }
  return root;
}

export function attr(a: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(a);
  return m ? m[1] : null;
}
function setAttr(a: string, name: string, value: string | null): string {
  const re = new RegExp(`(\\s)${name}="[^"]*"`);
  if (value === null) return a.replace(re, "");
  const v = ` ${name}="${escAttr(value)}"`;
  return re.test(a) ? a.replace(re, v) : a + v;
}
export const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escAttr = (s: string) => escHtml(s).replace(/"/g, "&quot;");
const classes = (nd: HNode) => (attr(nd.attrs, "class") || "").split(/\s+/).filter(Boolean);

function* walk(nd: HNode): Generator<HNode> {
  for (const k of nd.kids) { yield k; yield* walk(k); }
}
export function findTag(root: HNode, tag: string): HNode | null {
  for (const nd of walk(root)) if (nd.tag === tag) return nd;
  return null;
}

// ------------------------------------------------------------------ işaretleme (dışa aktarma sırasında)
const BOX_CLASS = /^(cl|collage|svc-tile|prof|w-fig|calc|sec-head|hero2-grid|trust2|faq2|profiles-head|cta-band|steps-cta|svc-hero-grid|req-card|page-head)$/;
const SKIP_TAGS = new Set(["form", "svg", "script", "style", "noscript", "template", "select", "details"]);

/** Sayfadaki düzenlenebilir ögelere kalıcı kimlik verir. Kimlik = bölüm + tür + sıra. */
export function annotate(html: string): string {
  const root = parseHtml(html);
  const main = findTag(root, "main");
  if (!main) return html;
  const edits: [number, string][] = []; // [konum, eklenecek öznitelik]
  const add = (nd: HNode, s: string) => edits.push([html[nd.oe - 2] === "/" ? nd.oe - 2 : nd.oe - 1, s]);
  const used = new Set<string>();
  let bi = 0;
  for (const b of main.kids) {
    bi++;
    let id = (attr(b.attrs, "id") || classes(b)[0] || b.tag).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) || "b";
    if (used.has(id)) id = `${id}-${bi}`;
    used.add(id);
    add(b, ` data-blok="${id}" data-e="${id}" data-k="blok"`);
    const cnt: Record<string, number> = {};
    const next = (k: string) => (cnt[k] = (cnt[k] || 0) + 1);
    const visit = (nd: HNode) => {
      if (SKIP_TAGS.has(nd.tag)) return;
      const cl = classes(nd);
      if (cl.includes("ph")) { add(nd, ` data-e="${id}.img${next("img")}" data-k="img"`); return; }
      let kind = "";
      if (/^h[1-4]$/.test(nd.tag)) kind = "h";
      else if (nd.tag === "p") kind = "p";
      else if (nd.tag === "img") kind = "img";
      else if ((nd.tag === "a" || nd.tag === "button") && cl.some((c) => c === "btn")) kind = "btn";
      else if ((nd.tag === "ul" || nd.tag === "ol") && nd.kids.filter((k) => k.tag === "li").length >= 2) kind = "l";
      else if (cl.some((c) => BOX_CLASS.test(c))) kind = "box";
      else if ((nd.tag === "span" || nd.tag === "strong" || nd.tag === "a") && nd.kids.length === 0 && cl.length && html.slice(nd.oe, nd.cs).trim()) kind = "t";
      if (kind === "l") {
        const lid = `${id}.l${next("l")}`;
        add(nd, ` data-e="${lid}" data-k="l"`);
        let k = 0;
        for (const li of nd.kids) {
          if (li.tag !== "li") continue;
          k++;
          add(li, ` data-e="${lid}-${k}" data-k="item"`);
          li.kids.forEach(visit);
        }
        return;
      }
      if (kind) add(nd, ` data-e="${id}.${kind}${next(kind)}" data-k="${kind}"`);
      nd.kids.forEach(visit);
    };
    b.kids.forEach(visit);
  }
  edits.sort((a, b) => b[0] - a[0]);
  let out = html;
  for (const [pos, s] of edits) out = out.slice(0, pos) + s + out.slice(pos);
  return out;
}

// ------------------------------------------------------------------ doğrulama
const ID_RE = /^[a-z0-9][a-z0-9.\-]{0,90}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SIZE = /^(auto|\d{1,4}(px|%))$/;
const PX = /^\d{1,4}px$/;
const BOX4 = /^-?\d{1,3}( -?\d{1,3}){0,3}$/;
const RATIOS = new Set(["1/1", "4/3", "3/2", "16/9", "4/5", "3/4", "9/16", "21/9", "2/1"]);
const SRC_RE = /^\/(api\/medya\/\d{1,9}(\?v=[a-z0-9]{1,20})?|assets\/[a-zA-Z0-9/_\-.]{1,120})$/;
const HREF_RE = /^(https?:\/\/[^\s"<>]{1,480}|\/(?!\/)[^\s"<>]{0,480}|#[a-zA-Z0-9_\-]{1,60}|mailto:[^\s"<>]{1,200}|tel:\+?[0-9 ]{3,20})$/;
const clampN = (v: unknown, a: number, b: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(b, Math.max(a, Math.round(v))) : undefined);

function cleanStyle(s: any): Style | undefined {
  if (!s || typeof s !== "object") return undefined;
  const o: Style = {};
  const fs = clampN(s.fs, 8, 200); if (fs !== undefined) o.fs = fs;
  if ([400, 500, 700].includes(s.fw)) o.fw = s.fw;
  if (typeof s.c === "string" && (HEX.test(s.c) || s.c === "transparent")) o.c = s.c;
  if (typeof s.bg === "string" && (HEX.test(s.bg) || s.bg === "transparent")) o.bg = s.bg;
  if (typeof s.w === "string" && SIZE.test(s.w)) o.w = s.w;
  if (typeof s.h === "string" && (PX.test(s.h) || s.h === "auto")) o.h = s.h;
  if (typeof s.mh === "string" && PX.test(s.mh)) o.mh = s.mh;
  if (typeof s.p === "string" && BOX4.test(s.p) && !s.p.includes("-")) o.p = s.p;
  if (typeof s.m === "string" && BOX4.test(s.m)) o.m = s.m;
  const r = clampN(s.r, 0, 400); if (r !== undefined) o.r = r;
  if (["left", "center", "right"].includes(s.ta)) o.ta = s.ta;
  const ord = clampN(s.o, -99, 99); if (ord !== undefined) o.o = ord;
  if (s.hide === true) o.hide = true;
  if (s.fit === "cover" || s.fit === "contain") o.fit = s.fit;
  if (typeof s.pos === "string" && /^\d{1,3}% \d{1,3}%$/.test(s.pos)) o.pos = s.pos;
  if (typeof s.ar === "string" && RATIOS.has(s.ar)) o.ar = s.ar;
  const cols = clampN(s.cols, 1, 12); if (cols !== undefined) o.cols = cols;
  return Object.keys(o).length ? o : undefined;
}

/** Editörden gelen tasarımı doğrular; geçersiz alanları atar. */
export function sanitizeDesign(input: unknown): Design {
  const d: Design = { v: 1 };
  if (!input || typeof input !== "object") return d;
  const src = input as any;
  if (Array.isArray(src.bloklar)) d.bloklar = src.bloklar.filter((x: unknown) => typeof x === "string" && ID_RE.test(x)).slice(0, 80);
  if (src.ozel && typeof src.ozel === "object") {
    d.ozel = {};
    for (const [bid, b] of Object.entries(src.ozel).slice(0, 40)) {
      if (!/^c-[a-z0-9]{3,12}$/.test(bid) || !b || !Array.isArray((b as any).items)) continue;
      d.ozel[bid] = {
        items: (b as any).items
          .filter((it: any) => it && typeof it.id === "string" && /^i-[a-z0-9]{3,12}$/.test(it.id) && TIP_SET.has(it.tip))
          .slice(0, 40)
          .map((it: any) => ({ id: it.id, tip: it.tip })),
      };
    }
  }
  if (src.el && typeof src.el === "object") {
    d.el = {};
    for (const [id, v] of Object.entries(src.el).slice(0, 2000)) {
      if (!ID_RE.test(id) || !v || typeof v !== "object") continue;
      const e = v as any;
      const o: ElOv = {};
      if (typeof e.t === "string") o.t = e.t.slice(0, 3000);
      if (typeof e.href === "string" && HREF_RE.test(e.href)) o.href = e.href;
      if (typeof e.src === "string" && SRC_RE.test(e.src)) o.src = e.src;
      if (typeof e.alt === "string") o.alt = e.alt.slice(0, 200);
      if (e.x === true) o.x = true;
      if (e.s && typeof e.s === "object") {
        const s: Partial<Record<Bp, Style>> = {};
        for (const bp of BPS) { const c = cleanStyle(e.s[bp]); if (c) s[bp] = c; }
        if (Object.keys(s).length) o.s = s;
      }
      if (Object.keys(o).length) d.el[id] = o;
    }
  }
  return d;
}

export function isEmptyDesign(d: Design | null | undefined) {
  return !d || ((!d.bloklar || !d.bloklar.length) && (!d.ozel || !Object.keys(d.ozel).length) && (!d.el || !Object.keys(d.el).length));
}

// ------------------------------------------------------------------ CSS
function decls(s: Style): string {
  const o: string[] = [];
  if (s.hide) return "display:none!important";
  if (s.fs) o.push(`font-size:${s.fs}px`);
  if (s.fw) o.push(`font-weight:${s.fw}`);
  if (s.c) o.push(`color:${s.c}`, `-webkit-text-stroke-color:${s.c}`);
  if (s.bg) o.push(`background:${s.bg}`);
  if (s.w) o.push(`width:${s.w}`, "max-width:100%");
  if (s.h) o.push(`height:${s.h}`);
  if (s.mh) o.push(`min-height:${s.mh}`);
  if (s.p) o.push(`padding:${s.p.split(" ").map((x) => x + "px").join(" ")}`);
  if (s.m) o.push(`margin:${s.m.split(" ").map((x) => x + "px").join(" ")}`);
  if (s.r !== undefined) o.push(`border-radius:${s.r}px`, "overflow:hidden");
  if (s.ta) o.push(`text-align:${s.ta}`);
  if (s.o !== undefined) o.push(`order:${s.o}`);
  if (s.fit) o.push(`object-fit:${s.fit}`);
  if (s.pos) o.push(`object-position:${s.pos}`);
  if (s.ar) o.push(`aspect-ratio:${s.ar}`, s.h ? "" : "height:auto");
  if (s.cols) o.push(`grid-column:span ${s.cols}`);
  return o.filter(Boolean).map((x) => x + "!important").join(";");
}

export function designCss(d: Design): string {
  const per: Record<Bp, string[]> = { d: [], t: [], m: [] };
  for (const [id, ov] of Object.entries(d.el || {})) {
    if (!ov.s) continue;
    for (const bp of BPS) {
      const st = ov.s[bp];
      if (!st) continue;
      const dl = decls(st);
      if (!dl) continue;
      const sel = `[data-e="${id}"]`;
      per[bp].push(`${sel}{${dl}}`);
      // görsel kapsayıcılarında içteki resim de aynı kırpmayı alır
      if (st.fit || st.pos) per[bp].push(`${sel} > img{${st.fit ? `object-fit:${st.fit}!important;` : ""}${st.pos ? `object-position:${st.pos}!important` : ""}}`);
    }
  }
  return BPS.filter((bp) => per[bp].length).map((bp) => `@media ${BP_MEDIA[bp]}{${per[bp].join("")}}`).join("\n");
}

// ------------------------------------------------------------------ yeni bölümlerin HTML'i
const DEF: Record<string, string> = {
  h: "Yeni başlık",
  p: "Buraya metin yaz. İçeriği sağ panelden düzenleyebilirsin.",
  btn: "Talep oluştur",
  href: "/talep-olustur",
};
function part(d: Design, id: string) {
  return d.el?.[id] || {};
}
function img(d: Design, id: string, cls: string) {
  const o = part(d, id);
  if (o.x) return "";
  const inner = o.src
    ? `<img src="${escAttr(o.src)}" alt="${escAttr(o.alt || "")}" loading="lazy" decoding="async">`
    : `<span class="ph"><span class="ph-n">GÖRSEL</span><span class="ph-t">Sağ panelden görsel seç</span></span>`;
  return `<div class="${cls}" data-e="${id}" data-k="img">${inner}</div>`;
}
function txt(d: Design, id: string, tag: string, cls: string, kind: string, def: string) {
  const o = part(d, id);
  if (o.x) return "";
  return `<${tag} class="${cls}" data-e="${id}" data-k="${kind}">${escHtml(o.t ?? def)}</${tag}>`;
}
function btn(d: Design, id: string, cls = "btn btn-primary") {
  const o = part(d, id);
  if (o.x) return "";
  return `<a class="${cls}" href="${escAttr(o.href || DEF.href)}" data-e="${id}" data-k="btn">${escHtml(o.t ?? DEF.btn)}</a>`;
}

export function renderItem(d: Design, bid: string, it: CItem): string {
  const iid = `${bid}.${it.id}`;
  if (part(d, iid).x) return "";
  let inner = "";
  switch (it.tip) {
    case "baslik": inner = txt(d, iid + ".h", "h2", "cb-h", "h", DEF.h); break;
    case "metin": inner = txt(d, iid + ".p", "p", "cb-p", "p", DEF.p); break;
    case "gorsel": inner = img(d, iid + ".img", "cb-media"); break;
    case "buton": inner = btn(d, iid + ".btn"); break;
    case "gorsel-metin":
      inner = `${img(d, iid + ".img", "cb-media")}<div class="cb-gm-txt">${txt(d, iid + ".h", "h3", "cb-h3", "h", "Görsel ve metin")}${txt(d, iid + ".p", "p", "cb-p", "p", DEF.p)}${btn(d, iid + ".btn", "btn btn-ghost")}</div>`;
      break;
    case "hizmet-karti":
      inner = `${img(d, iid + ".img", "cb-media")}<div class="cb-card-body">${txt(d, iid + ".h", "h3", "cb-h3", "h", "Hizmet adı")}${txt(d, iid + ".p", "p", "cb-p", "p", "Kısa açıklama.")}${btn(d, iid + ".btn", "text-link")}</div>`;
      break;
    case "kutu": inner = `${txt(d, iid + ".h", "h3", "cb-h3", "h", "Kutu başlığı")}${txt(d, iid + ".p", "p", "cb-p", "p", "Kısa içerik metni.")}`; break;
    case "banner": inner = `<div class="cb-banner-txt">${txt(d, iid + ".h", "h2", "cb-h", "h", "Ne istediğini biliyorsan başlayalım.")}${txt(d, iid + ".p", "p", "cb-p", "p", "Form seni adım adım yönlendirir.")}</div>${btn(d, iid + ".btn", "btn btn-signal")}`; break;
  }
  return `<div class="cb-item cb-${it.tip}" data-e="${iid}" data-k="item" data-tip="${it.tip}">${inner}</div>`;
}

export function renderBlock(d: Design, bid: string): string {
  const b = d.ozel?.[bid];
  if (!b || part(d, bid).x) return "";
  return `<section class="cb" data-blok="${bid}" data-e="${bid}" data-k="blok"><div class="wrap cb-grid" data-e="${bid}.g" data-k="l">${b.items.map((it) => renderItem(d, bid, it)).join("")}</div></section>`;
}

// ------------------------------------------------------------------ uygulama
/** Tasarımı (işaretlenmiş) sayfa HTML'ine uygular. */
export function applyDesign(html: string, d: Design, opts: { stripScripts?: boolean; extraHead?: string } = {}): string {
  const root = parseHtml(html);
  const main = findTag(root, "main");
  const head = findTag(root, "head");
  const el = d.el || {};
  // 1) öge düzeyi değişiklikler: [başlangıç, bitiş, yeni metin]
  const reps: [number, number, string][] = [];
  if (main) {
    for (const nd of walk(main)) {
      const id = attr(nd.attrs, "data-e");
      if (!id) continue;
      const ov = el[id];
      if (!ov) continue;
      if (ov.x && attr(nd.attrs, "data-k") !== "blok") { reps.push([nd.s, nd.e, ""]); continue; }
      const kind = attr(nd.attrs, "data-k");
      if (kind === "img" && ov.src) {
        const isImg = nd.tag === "img";
        if (isImg) {
          let a = setAttr(nd.attrs, "src", ov.src);
          a = setAttr(a, "srcset", null);
          if (ov.alt !== undefined) a = setAttr(a, "alt", ov.alt);
          reps.push([nd.s, nd.e, `<img${a}>`]);
        } else {
          // yer tutucu → resim
          reps.push([nd.oe, nd.cs, `<img class="ph-img" src="${escAttr(ov.src)}" alt="${escAttr(ov.alt || "")}" loading="lazy" decoding="async">`]);
          const a = setAttr(nd.attrs, "class", (attr(nd.attrs, "class") || "").replace(/\bph\b/, "ph ph-full").trim());
          reps.push([nd.s, nd.oe, `<${nd.tag}${a}>`]);
        }
        continue;
      }
      if (nd.tag === "img" && ov.alt !== undefined) { reps.push([nd.s, nd.e, `<img${setAttr(nd.attrs, "alt", ov.alt)}>`]); continue; }
      let openChanged = false;
      let a = nd.attrs;
      if (ov.href && nd.tag === "a") { a = setAttr(a, "href", ov.href); openChanged = true; }
      if (openChanged) reps.push([nd.s, nd.oe, `<${nd.tag}${a}>`]);
      if (ov.t !== undefined && nd.kids.length === 0 && kind !== "blok" && kind !== "l") reps.push([nd.oe, nd.cs, escHtml(ov.t)]);
    }
  }
  reps.sort((a, b) => a[0] - b[0]);
  const slice = (a: number, b: number) => {
    let out = "";
    let pos = a;
    for (const [s, e, t] of reps) {
      if (s < a || e > b || s < pos) continue;
      out += html.slice(pos, s) + t;
      pos = e;
    }
    return out + html.slice(pos, b);
  };
  // 2) bölümler: sıra, kaldırma, yeni bölümler
  let mainHtml = "";
  let pre = "", post = "";
  if (main) {
    const blocks = main.kids.filter((k) => attr(k.attrs, "data-blok"));
    const byId = new Map(blocks.map((b) => [attr(b.attrs, "data-blok")!, b]));
    const order: string[] = [];
    for (const id of d.bloklar || []) if ((byId.has(id) || d.ozel?.[id]) && !order.includes(id)) order.push(id);
    // listede olmayan mevcut bölümler, önceki komşusunun ardına (yeni eklenen kod bölümleri kaybolmasın)
    blocks.forEach((b, i) => {
      const id = attr(b.attrs, "data-blok")!;
      if (order.includes(id)) return;
      const prev = i > 0 ? attr(blocks[i - 1].attrs, "data-blok")! : null;
      const at = prev ? order.indexOf(prev) : -1;
      order.splice(at + 1, 0, id);
    });
    for (const id of Object.keys(d.ozel || {})) if (!order.includes(id)) order.push(id);
    mainHtml = order
      .map((id) => {
        if (el[id]?.x) return "";
        const b = byId.get(id);
        if (b) return slice(b.s, b.e);
        return renderBlock(d, id);
      })
      .join("");
    const first = blocks[0], last = blocks[blocks.length - 1];
    pre = slice(0, first ? first.s : main.oe);
    post = slice(last ? last.e : main.oe, html.length);
  } else {
    pre = html;
  }
  let out = pre + mainHtml + post;
  // 3) stiller + isteğe bağlı başlık eki
  const css = designCss(d);
  const inject = (css ? `<style id="brif-tasarim">${css}</style>` : "") + (opts.extraHead || "");
  if (inject && head) {
    const at = out.indexOf("</head>");
    if (at > 0) out = out.slice(0, at) + inject + out.slice(at);
  }
  if (opts.stripScripts) out = out.replace(/<script\b(?![^>]*type="application\/(ld\+)?json")[^>]*>[\s\S]*?<\/script>/g, "");
  return out;
}

/** URL yolunu tasarım anahtarına çevirir: "/hizmetler/" → "/hizmetler", "/x.html" → "/x" */
export function pageKey(path: string): string {
  let p = path.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

export function uid(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 9);
}
