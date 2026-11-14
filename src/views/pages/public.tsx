import type { Category, Page, Service, Settings } from "../../lib/repo";
import { Markdown, headings } from "../../lib/markdown";
import { tl, tierRange } from "../../lib/pricing";
import { generalFaq } from "../../data/general-faq";
import { Breadcrumbs, CtaBand, FaqList } from "../components/ui";
import { Icon } from "../components/icons";
import { CATEGORIES, SERVICES, servicesOf, categoryBySlug } from "../../data/catalog";
import type { Hub } from "../../data/hubs";
import { safeJson } from "../../lib/seo";

const slugify = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ------------------------------------------------------------------ ANA SAYFA
/** Bütçe hesaplayıcısının istemciye giden verisi: yalnızca birim sorusu ve fiyat kuralı. */
export function calcData(services: Service[]) {
  return services
    .filter((x) => x.pricing.enabled && x.pricing.unitKey)
    .map((x) => {
      const uq = x.questions.find((q) => q.key === x.pricing.unitKey)!;
      return {
        slug: x.slug,
        name: x.name,
        unit: { key: uq.key, label: uq.label, type: uq.type, min: uq.min, max: uq.max, placeholder: uq.placeholder, options: uq.options?.filter((o) => o.units !== undefined) },
        pricing: { ...x.pricing, verified: true },
      };
    });
}

// Kategori ikonları (Lucide, ince çizgi)
const CAT_ICO: Record<string, string[]> = {
  "fotograf-video": ["M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z", "c:12,13,3"],
  "grafik-tasarim": ["m12 19 7-7 3 3-7 7-3-3z", "m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z", "m2 2 7.586 7.586", "c:11,11,2"],
  "web-yazilim": ["M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M8 21h8", "M12 17v4", "m9 9-2 1.5L9 12", "m15 9 2 1.5-2 1.5"],
  "reklam-eticaret": ["m3 11 18-5v12L3 14v-3z", "M11.6 16.8a3 3 0 1 1-5.8-1.6"],
  "sosyal-medya": ["c:18,5,3", "c:6,12,3", "c:18,19,3", "m8.59 13.51 6.83 3.98", "m15.41 6.51-6.82 3.98"],
  "metin-icerik": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8"],
};
export function CatIcon({ slug, size = 22 }: { slug: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {(CAT_ICO[slug] || CAT_ICO["metin-icerik"]).map((d, i) => {
        if (d.startsWith("c:")) { const [cx, cy, r] = d.slice(2).split(","); return <circle key={i} cx={cx} cy={cy} r={r} />; }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}

/** Sade kategori kartları: ikon, ad, kısa açıklama, öne çıkan hizmetler, teklif linki */
export function CatCards() {
  return (
    <ul className="cat-cards">
      {CATEGORIES.map((c) => {
        const subs = servicesOf(c.slug);
        return (
          <li key={c.slug} id={c.slug}>
            <a className="cat-card" href={`/talep-olustur?kategori=${c.slug}`}>
              <span className="cc-ico"><CatIcon slug={c.slug} /></span>
              <span className="cc-name">{c.name}</span>
              <span className="cc-short">{c.short}</span>
              <span className="cc-subs">{subs.slice(0, 3).map((x) => x.name).join(" · ")}{subs.length > 3 ? ` +${subs.length - 3}` : ""}</span>
              <span className="cc-go">Teklif al <span aria-hidden="true">→</span></span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

const POPULER: [string, string][] = [
  ["Ürün fotoğrafı", "/hizmetler/urun-fotografcisi"],
  ["Tanıtım filmi", "/hizmetler/tanitim-videosu-cekimi"],
  ["Logo & kurumsal kimlik", "/hizmetler/grafik-tasarim"],
  ["Web sitesi", "/talep-olustur?kategori=web-yazilim"],
  ["Meta reklam", "/hizmetler/meta-reklam-yonetimi"],
  ["Sosyal medya yönetimi", "/hizmetler/sosyal-medya-yonetimi"],
];

export function Home(_: { s: Settings; cats: Category[]; services: Service[] }) {
  return (
    <>
      {/* ---------------------------------------------------------------- GİRİŞ */}
      <section className="hero3" aria-labelledby="hero-h">
        <div className="wrap hero3-in">
          <h1 id="hero-h" className="hero3-h">
            İhtiyacını anlat, <span className="h-line">doğru hizmete ulaş.</span>
          </h1>
          <p className="hero3-lead">Fotoğraf ve video, tasarım, web sitesi ve dijital reklam işlerin için kısa bir form doldur; kapsamına ve bütçene uygun yazılı teklif al.</p>
          <div className="hero3-actions">
            <a href="/talep-olustur" className="btn btn-primary btn-lg">Ücretsiz teklif al</a>
            <a href="#hizmetler" className="btn btn-ghost btn-lg">Hizmetlere göz at</a>
          </div>
          <ul className="hero-facts hero3-facts">
            <li>Ücretsiz, üyelik yok</li>
            <li>Yaklaşık 3 dakika</li>
            <li>Yazılı kapsam ve fiyat</li>
          </ul>
          <nav className="hero3-pop" aria-label="Popüler hizmetler">
            <span>Popüler:</span>
            <ul>
              {POPULER.map(([t, href]) => (
                <li key={href}><a href={href}>{t}</a></li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* ---------------------------------------------------------------- HİZMETLER */}
      <section className="section" id="hizmetler" aria-labelledby="h-hizmetler">
        <div className="wrap">
          <header className="sec-head2">
            <h2 id="h-hizmetler" className="h-lg">Ne yaptırmak istiyorsun?</h2>
            <p>Kategoriyi seç; form hizmete göre birkaç soru sorar.</p>
          </header>
          <CatCards />
          <p className="sec-more"><a className="text-link" href="/hizmetler">Tüm hizmetler ({SERVICES.length})</a></p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- SÜREÇ */}
      <section className="section bg-gray" id="nasil" aria-labelledby="h-nasil">
        <div className="wrap">
          <header className="sec-head2">
            <h2 id="h-nasil" className="h-lg">Nasıl çalışır?</h2>
            <p>Üç adımda teklifini al.</p>
          </header>
          <HowSteps />
          <div className="steps-cta">
            <a className="btn btn-primary" href="/talep-olustur">Talep oluştur</a>
            <a className="text-link" href="/nasil-calisir">Sürecin ayrıntıları</a>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- NEDEN BRİF */}
      <section className="section" aria-labelledby="h-neden">
        <div className="wrap">
          <header className="sec-head2">
            <h2 id="h-neden" className="h-lg">Neden Brif?</h2>
          </header>
          <ul className="why">
            {[
              ["Ücretsiz ve üyeliksiz", "Talep oluşturmak ücretsiz; hesap açman gerekmez.", "M20 6 9 17l-5-5"],
              ["Yazılı kapsam ve fiyat", "Teslim, revizyon ve tarih iş başlamadan yazılı olarak netleşir.", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM9 15l2 2 4-4"],
              ["Bütçene göre yön", "Bütçen düşükse reddedilmez; kapsam bütçene göre önerilir.", "M3 3v18h18M7 16l4-4 3 3 5-6"],
              ["Takip numarası", "Her talebe bir numara verilir; süreç kayıt altında ilerler.", "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"],
            ].map(([t, d, ico]) => (
              <li key={t}>
                <span className="why-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={ico} /></svg>
                </span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- SSS */}
      <section className="section bg-gray" aria-labelledby="h-sss">
        <div className="wrap faq2">
          <div className="faq2-head">
            <h2 id="h-sss" className="h-lg">Sık sorulan sorular</h2>
            <p><a className="text-link" href="/sss">Tüm sorular</a></p>
          </div>
          <FaqList items={generalFaq.slice(0, 5)} />
        </div>
      </section>

      <CtaBand title="Projeni anlat, teklifini al." text="Ne istediğinden emin değilsen de form seni adım adım yönlendirir." label="Ücretsiz teklif al" />
    </>
  );
}

/** Bütçe hesaplayıcı (Fiyat rehberi sayfasında; istemci kodu home.js) */
export function BudgetCalc({ services }: { services: Service[] }) {
  const calc = calcData(services);
  const first = calc[0];
  if (!first) return null;
  return (
    <section className="section" id="butce-rehberi" aria-labelledby="h-rehber">
      <div className="wrap calc-grid">
        <div className="calc-intro">
          <h2 id="h-rehber" className="h-lg">Bütçen ne kadar iş karşılar?</h2>
          <p className="lead">Hizmeti seç, kapsamı ve bütçeni yaz; rehber aralığı anında gör.</p>
        </div>
        <form className="calc" id="hesap" action="/talep-olustur" method="get" aria-label="Bütçe rehberi">
          <div className="field">
            <label htmlFor="h-hizmet">Hizmet</label>
            <select id="h-hizmet" name="hizmet" defaultValue={first.slug}>
              {calc.map((x) => (
                <option key={x.slug} value={x.slug}>{x.name}</option>
              ))}
            </select>
          </div>
          <div className="field" id="h-kapsam-alan">
            <label htmlFor="h-kapsam">{first.unit.label}</label>
            <input id="h-kapsam" name={first.unit.key} inputMode="numeric" placeholder={first.unit.placeholder || ""} />
          </div>
          <div className="field">
            <label htmlFor="h-butce">Hedef bütçen</label>
            <div className="money">
              <input id="h-butce" name="butce" inputMode="numeric" autoComplete="off" placeholder="Örn. 10.000" />
              <span aria-hidden="true">₺</span>
            </div>
          </div>
          <div className="calc-result" id="h-sonuc" aria-live="polite">
            <p className="calc-msg">Kapsamı ve bütçeni gir; rehber burada görünecek.</p>
          </div>
          <button type="submit" className="btn btn-primary btn-lg btn-block">Bu bilgilerle talep oluştur</button>
          <p className="small muted calc-foot">Rakamlar başlangıç rehberidir. Kesin fiyat, kapsam netleşince yazılı verilir.</p>
          <script id="hesap-data" type="application/json" dangerouslySetInnerHTML={{ __html: safeJson(calc) }} />
        </form>
      </div>
    </section>
  );
}

export function HowSteps() {
  const steps: [string, string][] = [
    ["İhtiyacını anlat", "Kategoriyi seç, hizmete özel birkaç soruyu yanıtla ve bütçeni yaz. Bilmediğin yerleri boş bırakabilirsin."],
    ["Teklifini al", "Talebin alanında uzman ekibe düşer. Kapsam, tarih ve fiyat yazılı teklif olarak sana iletilir."],
    ["İşe başla", "Teklifi onayladığında iş başlar; teslim ve revizyonlar baştan belirlenen plana göre ilerler."],
  ];
  return (
    <ol className="steps3">
      {steps.map(([t, d], i) => (
        <li key={i}>
          <span className="s3-n" aria-hidden="true">{i + 1}</span>
          <h3><span className="sr">Adım {i + 1}: </span>{t}</h3>
          <p>{d}</p>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ ALAN SAYFALARI (Stüdyo / Tasarım / Dijital)
// Hizmet listesi + kimler için + rehber fiyatlar. Admin → Örnek işler'de iş varsa Worker ızgarayı doldurur; boşken bölüm gizlenir.
export function HubPage({ hub }: { hub: Hub; posts?: { href: string; baslik: string }[] }) {
  const first = hub.kategoriler[0];
  const groups = hub.kategoriler.map((k) => ({ cat: categoryBySlug(k), items: SERVICES.filter((x) => x.category === k) })).filter((g) => g.items.length);
  return (
    <>
      <section className="pf-hero">
        <div className="wrap pf-hero-grid">
          <div>
            <span className="tag">{hub.ad} · {hub.alt}</span>
            <h1>{hub.h1}</h1>
          </div>
          <div className="pf-hero-side">
            <p className="pf-cevap"><strong>{hub.cevap}</strong></p>
            <a className="btn btn-primary" href={`/talep-olustur?kategori=${first}`}>Talep oluştur</a>
          </div>
        </div>
      </section>

      <section className="section hub-svc" aria-labelledby="h-hub-svc">
        <div className="wrap">
          <header className="sec-head">
            <div>
              <span className="tag">Hizmetler</span>
              <h2 id="h-hub-svc" className="h-xl">Neler yapıyoruz?</h2>
            </div>
            <p>{hub.lead}</p>
          </header>
          {groups.map((g) => (
            <div className="hub-group" key={g.cat?.slug || g.items[0].category}>
              {groups.length > 1 && g.cat ? <h3 className="hub-group-h">{g.cat.name}</h3> : null}
              <ul className="hub-list">
                {g.items.map((x) => (
                  <li key={x.slug}>
                    <a href={x.page ? `/hizmetler/${x.page}` : `/talep-olustur?kategori=${x.category}&hizmet=${x.slug}`}>
                      <span>{x.name}</span>
                      <span className="hl-ok" aria-hidden="true">→</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="section bg-gray hub-info" aria-label="Kimler için ve rehber fiyatlar">
        <div className="wrap hub-2col">
          <div>
            <span className="tag">Kimler için</span>
            <ul className="hub-check">
              {hub.kimler.map((k) => (
                <li key={k}><Icon name="ok" size={18} />{k}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="tag">Rehber fiyatlar</span>
            <dl className="hub-price">
              {hub.fiyat.map((f) => {
                const i = f.indexOf(": ");
                return (
                  <div key={f}>
                    <dt>{i > 0 ? f.slice(0, i) : f}</dt>
                    <dd>{i > 0 ? f.slice(i + 2) : ""}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="small muted">Kesin fiyat kapsam netleşince yazılı verilir. <a className="text-link" href="/fiyat-rehberi">Fiyat rehberi</a></p>
          </div>
        </div>
      </section>

      <section className="pf-sec" aria-label={`${hub.ad} işleri`}>
        <div className="wrap">
          <div className="pf-grid" data-alan={hub.key} dangerouslySetInnerHTML={{ __html: `<!--ISLER:${hub.key}--><!--/ISLER-->` }} />
        </div>
      </section>

      <CtaBand title="Projeni anlat, teklifini al." text="Kapsamı yaz, yazılı teklifle dönüş yapalım." label="Talep oluştur" href={`/talep-olustur?kategori=${first}`} />

      <section className="section section-tight pf-faq" aria-labelledby="h-hub-sss">
        <div className="wrap narrow">
          <h2 id="h-hub-sss" className="h-sm">Sık sorulanlar</h2>
          <FaqList items={hub.sss} />
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ HİZMETLER LİSTESİ
export function ServicesPage({ services }: { cats: Category[]; services: Service[] }) {
  const pages = new Set(services.map((x) => x.slug));
  const guides = SERVICES.filter((x) => x.page && pages.has(x.page));
  return (
    <>
      <PageHead crumbs={[{ name: "Ana sayfa", path: "/ana-sayfa" }, { name: "Hizmetler", path: "/hizmetler" }]} title="Hizmetler" lead={`6 kategoride ${SERVICES.length} hizmet. Kategoriyi seç; alt hizmeti ve detayları talep formunda birlikte belirleyelim.`} />
      <section className="section section-tight">
        <div className="wrap">
          <CatCards />
          {guides.length ? (
            <nav className="svc-guides" aria-label="Hizmet rehberleri">
              <h2 className="h-sm">Hizmet rehberleri</h2>
              <ul>
                {guides.map((x) => (
                  <li key={x.slug}><a href={`/hizmetler/${x.page}`}>{x.name}</a></li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </section>
      <CtaBand title="Aradığın hizmeti bulamadın mı?" text="En yakın kategoriyi seç ve açıklama alanında ihtiyacını anlat." label="Talep oluştur" />
    </>
  );
}

function PageHead({ crumbs, title, lead }: { crumbs: { name: string; path: string }[]; title: string; lead?: string }) {
  return (
    <section className="page-head">
      <div className="wrap">
        <Breadcrumbs items={crumbs} />
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ HİZMET DETAY
export function ServicePage({ s, svc, related }: { s: Settings; svc: Service; related: Service[] }) {
  const pr = svc.pricing;
  const showPrices = pr.enabled && pr.verified && pr.tiers.length > 0;
  const toc = headings(svc.body);
  return (
    <>
      <section className="page-head svc-head">
        <div className="wrap">
          <Breadcrumbs items={[{ name: "Ana sayfa", path: "/" }, { name: "Hizmetler", path: "/hizmetler" }, { name: svc.name, path: `/hizmetler/${svc.slug}` }]} />
          <p className="svc-cat"><a href={`/hizmetler#${svc.category_slug}`}>{svc.category_name}</a></p>
          <h1>{svc.h1}</h1>
          <p className="lead">{svc.meta_description}</p>
          <div className="head-actions">
            <a className="btn btn-signal btn-lg" href={`/talep-olustur?hizmet=${svc.slug}`}>
              İş talebi oluştur
            </a>
            <a className="text-link" href="#fiyat">Fiyatı neler belirler?</a>
          </div>
        </div>
      </section>
      <div className="wrap svc-layout">
        <article className="prose svc-body">
          {svc.image_url ? <img src={svc.image_url} alt={svc.image_alt || svc.name} className="svc-img" loading="eager" decoding="async" /> : null}
          <Markdown source={svc.body} />
        </article>
        <aside className="svc-aside" aria-label="Özet">
          <div className="aside-box" id="fiyat">
            <h2 className="aside-h">Fiyat rehberi</h2>
            {showPrices ? (
              <>
                <ul className="tiers" data-fiyat-tiers={svc.slug}>
                  {pr.tiers.map((t) => (
                    <li key={t.name}>
                      <span className="tier-name">{t.name}</span>
                      <span className="tier-range">{tierRange(t)}</span>
                      <span className="tier-inc">{t.includes.join(", ")}</span>
                    </li>
                  ))}
                </ul>
                <p className="small muted">
                  {pr.note} Kaynak: {pr.source}. Son güncelleme: {fmtDate(pr.updatedAt)}.
                </p>
              </>
            ) : (
              <p className="small">
                Bu hizmet için fiyat aralıkları henüz yayımlanmadı. Talep formunda kapsamı anlatman yeterli; işine özel teklif hazırlanır.
              </p>
            )}
            <a className="btn btn-primary btn-block" href={`/talep-olustur?hizmet=${svc.slug}`}>Teklif iste</a>
          </div>
          {toc.length > 1 ? (
            <nav className="aside-box toc" aria-label="Bu sayfada">
              <h2 className="aside-h">Bu sayfada</h2>
              <ul>
                {toc.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </nav>
          ) : null}
        </aside>
      </div>
      {svc.faq.length ? (
        <section className="section" aria-labelledby="h-svc-sss">
          <div className="wrap narrow">
            <h2 id="h-svc-sss">{svc.name} hakkında sık sorulanlar</h2>
            <FaqList items={svc.faq} />
          </div>
        </section>
      ) : null}
      {related.length ? (
        <section className="section section-tint" aria-labelledby="h-ilgili">
          <div className="wrap">
            <h2 id="h-ilgili">İlgili hizmetler</h2>
            <ul className="related">
              {related.map((r) => (
                <li key={r.slug}>
                  <a href={`/hizmetler/${r.slug}`} className="svc-row">
                    <span className="svc-name">{r.name}</span>
                    <span className="svc-sum">{r.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      <CtaBand title={`${svc.name} için talep oluştur`} text="Birkaç soruyu yanıtla, kapsamına uygun dönüş al. Ücretsiz ve üyeliksiz." href={`/talep-olustur?hizmet=${svc.slug}`} />
    </>
  );
}

export const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
};

// ------------------------------------------------------------------ NASIL ÇALIŞIR
export function HowPage() {
  return (
    <>
      <PageHead crumbs={[{ name: "Ana sayfa", path: "/" }, { name: "Nasıl çalışır?", path: "/nasil-calisir" }]} title="Nasıl çalışır?" lead="Fikrinden teslimata kadar her adım net." />
      <section className="section section-tight">
        <div className="wrap">
          <HowSteps />
        </div>
      </section>
      <section className="section section-tint">
        <div className="wrap narrow prose">
          <h2>Talebin doğru ekibe gider</h2>
          <p>
            Her talep alanına göre Brif Stüdyo, Brif Tasarım ya da Brif Dijital ekibine düşer. Ekip brifini okur, eksik bir şey varsa sorar ve yazılı teklifle döner.
          </p>
          <h2>İş başlamadan neler netleşir?</h2>
          <ul>
            <li>Teslim edilecekler (adet, format, süre)</li>
            <li>Revizyon sayısı ve kapsam dışı işlerin nasıl ücretlendirileceği</li>
            <li>Teslim tarihi ve ara teslimler</li>
            <li>Toplam ücret ve ödeme planı</li>
          </ul>
          <h2>Yaratıcılar için bir platform</h2>
          <p>
            Brif; fotoğrafçıları, tasarımcıları, video ve dijital pazarlama uzmanlarını iyi brifle buluşturur. Eşleştirmede fiyat kadar portföy, deneyim ve takvim de önemlidir.
          </p>
        </div>
      </section>
      <CtaBand title="Hazırsan ilk adımı at." text="Talep formu yaklaşık 3 dakika sürer." />
    </>
  );
}

// ------------------------------------------------------------------ FİYAT REHBERİ
export function PriceGuidePage({ services }: { services: Service[] }) {
  return (
    <>
      <PageHead crumbs={[{ name: "Ana sayfa", path: "/" }, { name: "Fiyat rehberi", path: "/fiyat-rehberi" }]} title="Fiyat rehberi" lead="Freelance işlerde fiyatı belirleyen şey kapsamdır. Bu sayfa, her hizmette fiyatı neyin değiştirdiğini ve yayımlanmışsa rehber aralıkları gösterir." />
      <section className="section section-tight">
        <div className="wrap narrow prose">
          <h2>Bu rehber nasıl kullanılır?</h2>
          <p>
            Rakamlar kesin teklif değildir; benzer kapsamdaki işler için yön göstermek amacıyla Brif tarafından belirlenir. Her aralığın yanında kaynağı ve son güncelleme tarihi yazar. Henüz doğrulanmamış aralıklar yayımlanmaz; bu hizmetlerde talep bırakıp işine özel teklif alabilirsin.
          </p>
          <p>
            Talep formunda girdiğin bütçe, seçtiğin kapsamla karşılaştırılır. Bütçen kapsamın altında kalıyorsa küçük bir not görürsün. Bu not seni engellemez; bütçeni güncelleyebilir ya da aynı tutarla devam edebilirsin.
          </p>
        </div>
      </section>
      <BudgetCalc services={services} />
      <section className="section">
        <div className="wrap">
          <div className="price-table" role="table" aria-label="Hizmetlere göre fiyat rehberi">
            <div role="row" className="pt-row pt-head">
              <span role="columnheader">Hizmet</span>
              <span role="columnheader">Fiyatı en çok etkileyen</span>
              <span role="columnheader">Rehber aralık</span>
            </div>
            {services.map((svc) => {
              const pr = svc.pricing;
              const show = pr.enabled && pr.verified && pr.tiers.length;
              const factors = [pr.unitLabel && `${pr.unitLabel} sayısı`, ...pr.addons.map((a) => a.label.toLocaleLowerCase("tr"))].filter(Boolean).slice(0, 3);
              return (
                <div role="row" className="pt-row" key={svc.slug}>
                  <span role="cell" className="pt-name">
                    <a href={`/hizmetler/${svc.slug}`}>{svc.name}</a>
                  </span>
                  <span role="cell">{factors.length ? factors.join(", ") : "Kapsama göre"}</span>
                  <span role="cell">
                    {show ? (
                      <>
                        <span data-fiyat-from={svc.slug}>{tl(pr.tiers[0].from || pr.base)}</span> ve üzeri
                        <span className="small muted block">Güncelleme: {fmtDate(pr.updatedAt)}</span>
                      </>
                    ) : (
                      <span className="muted">Teklif al</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="section section-tint">
        <div className="wrap narrow prose">
          <h2>Neden çok düşük bütçeler sorun yaratır?</h2>
          <p>
            Düşük bütçe genellikle ya kapsamın sessizce küçülmesiyle ya da işin aceleye getirilmesiyle sonuçlanır. Sürdürülemez fiyatla iş alan bir hizmet sağlayıcı da zamanla kaliteyi düşürmek zorunda kalır. Rehberin amacı fiyatları yükseltmek değil; ne ödediğini ve karşılığında ne alacağını baştan görebilmen.
          </p>
          <p>Bütçen sınırlıysa bunu söylemekten çekinme. Kapsamı küçültmek (daha az ürün, daha kısa video) çoğu zaman en iyi çözümdür.</p>
        </div>
      </section>
      <CtaBand title="Kapsamını anlat, rehberi formda gör." text="Bütçe uyarısı hizmete ve verdiğin cevaplara göre hesaplanır." />
    </>
  );
}

// ------------------------------------------------------------------ SSS
export function FaqPage() {
  return (
    <>
      <PageHead crumbs={[{ name: "Ana sayfa", path: "/" }, { name: "Sık sorulan sorular", path: "/sss" }]} title="Sık sorulan sorular" lead="Hizmete özel sorular ilgili hizmet sayfalarında yer alır." />
      <section className="section section-tight">
        <div className="wrap narrow">
          <FaqList items={generalFaq} headingLevel={2} />
        </div>
      </section>
      <CtaBand title="Cevabını bulamadın mı?" text="Sorunu talep formunun açıklama alanına yazabilirsin." />
    </>
  );
}

// ------------------------------------------------------------------ CMS SAYFASI
export function CmsPage({ page }: { page: Page }) {
  return (
    <>
      <PageHead crumbs={[{ name: "Ana sayfa", path: "/" }, { name: page.title, path: "/" + page.slug }]} title={page.title} />
      <section className="section section-tight">
        <div className="wrap narrow prose">
          <Markdown source={page.body} />
          <p className="small muted">Son güncelleme: {fmtDate(page.updated_at)}</p>
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ 404
export function NotFound({ services }: { services: Service[] }) {
  return (
    <section className="section">
      <div className="wrap narrow">
        <img className="nf-art" src="/assets/ill/time-management-planning.svg" alt="" width="320" height="267" />
        <p className="nf-code" aria-hidden="true">404</p>
        <h1>Aradığın sayfa bulunamadı</h1>
        <p className="lead">Bağlantı eski olabilir ya da sayfa kaldırılmış olabilir. Hizmetlerden birine göz atabilir veya doğrudan talep oluşturabilirsin.</p>
        <div className="head-actions">
          <a className="btn btn-primary" href="/talep-olustur">İş talebi oluştur</a>
          <a className="text-link" href="/hizmetler">Tüm hizmetler</a>
        </div>
        <ul className="nf-list">
          {services.slice(0, 6).map((s) => (
            <li key={s.slug}><a href={`/hizmetler/${s.slug}`}>{s.name}</a></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ TALEP SAYFASI KABUĞU
export function RequestShell({ islandHtml, s }: { islandHtml: string; s: Settings }) {
  return (
    <section className="req-wrap">
      <div className="wrap req-narrow">
        <h1 className="req-h">İş talebi oluştur</h1>
        <p className="req-lead">Birkaç kısa adım. Bilmediğin soruları boş bırakabilirsin.</p>
        <div id="talep-root" dangerouslySetInnerHTML={{ __html: islandHtml }} />
        <noscript>
          <p className="note">
            Talep formu için JavaScript gerekiyor.
            {s.contact_email ? <> Dilersen talebini <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a> adresine e-postayla da gönderebilirsin.</> : null}
          </p>
        </noscript>
      </div>
    </section>
  );
}

export { slugify };

// ------------------------------------------------------------------ BLOG KABUĞU (içerik Worker tarafından doldurulur)
export function BlogShell() {
  return <div className="blog-root" dangerouslySetInnerHTML={{ __html: "<!--BLOG_MAIN-->" }} />;
}
