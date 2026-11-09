import type { Category, Page, Service, Settings } from "../../lib/repo";
import { Markdown, headings } from "../../lib/markdown";
import { tl, tierRange } from "../../lib/pricing";
import { generalFaq } from "../../data/general-faq";
import { Breadcrumbs, CtaBand, FaqList } from "../components/ui";
import { Icon } from "../components/icons";
import { Ph, HERO_PH, PORTFOLIO_PH, CatImg } from "../components/placeholders";
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

export function Home({ s, services }: { s: Settings; cats: Category[]; services: Service[] }) {
  const calc = calcData(services);
  const first = calc[0];
  const spans = ["t-7", "t-5", "t-5", "t-7", "t-6", "t-6"];
  return (
    <>
      {/* ---------------------------------------------------------------- HERO */}
      <section className="hero2 bg-gray" aria-labelledby="hero-h">
        <div className="wrap hero2-grid">
          <div className="hero2-copy">
            <ul className="tags" aria-label="Hizmet alanları">
              <li><a href="/">Fotoğraf</a></li>
              <li><a href="/tasarim">Tasarım</a></li>
              <li><a href="/dijital">Web</a></li>
              <li><a href="/dijital">Reklam</a></li>
            </ul>
            <h1 id="hero-h" className="hero2-h">
              İhtiyacını anlat, <span className="h-line">doğru hizmete ulaş.</span>
            </h1>
            <p className="hero2-lead">
              Ürün çekiminden web sitesine, logodan Meta reklamlarına kadar ihtiyacın olan işi birkaç adımda anlat. Talebini okuyup kapsamına ve bütçene uygun bir teklifle dönelim.
            </p>
            <div className="hero-actions">
              <a href="/talep-olustur" className="btn btn-primary btn-lg">Projen için talep oluştur</a>
              <a href="#hizmetler" className="btn btn-ghost btn-lg">Hizmetleri keşfet</a>
            </div>
            <ul className="hero-facts">
              <li>Ücretsiz, üyelik yok</li>
              <li>Yaklaşık 3 dakika</li>
              <li>Her talebi uzman ekip okur</li>
            </ul>
          </div>
          <div className="collage" aria-label="İş örnekleri">
            <figure className="cl cl-photo">
              <Ph {...HERO_PH.photo} />
              <figcaption className="cl-tag">Fotoğraf</figcaption>
            </figure>
            <figure className="cl cl-poster">
              <Ph {...HERO_PH.poster} />
              <figcaption className="cl-tag">Grafik tasarım</figcaption>
            </figure>
            <figure className="cl cl-web">
              <Ph {...HERO_PH.web} />
              <figcaption className="cl-tag">Web arayüzü</figcaption>
            </figure>
            <figure className="cl cl-video" aria-hidden="true">
              <Ph {...HERO_PH.video} />
            </figure>
            <div className="cl-chip" aria-hidden="true">
              <span className="status-dot" />
              <span>
                <strong>Yeni talep</strong>
                <span className="block">Ürün fotoğrafçılığı, 25 ürün</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- HİZMETLER */}
      <section className="section" id="hizmetler" aria-labelledby="h-hizmetler">
        <div className="wrap">
          <header className="sec-head">
            <div>
              <span className="tag">Hizmetler</span>
              <h2 id="h-hizmetler" className="h-xl">Altı alan, {SERVICES.length} hizmet.</h2>
            </div>
            <p>Kategoriyi seç, gerisini form sorar.</p>
          </header>
          <ul className="svc-bento">
            {CATEGORIES.map((c, i) => {
              const subs = servicesOf(c.slug);
              return (
                <li key={c.slug} className={spans[i]}>
                  <a className="svc-tile" href={`/talep-olustur?kategori=${c.slug}`}>
                    <span className="svc-art">
                      <CatImg slug={c.slug} />
                    </span>
                    <span className="svc-meta">
                      <span className="svc-n">{String(i + 1).padStart(2, "0")}</span>
                      <span className="svc-txt">
                        <span className="svc-title">{c.name}</span>
                        <span className="svc-short">{c.short}</span>
                      </span>
                      <span className="svc-count">
                        {subs.length} hizmet
                        <Icon name="ok" size={18} />
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- SÜREÇ */}
      <section className="section bg-mint" id="nasil" aria-labelledby="h-nasil">
        <div className="wrap">
          <header className="sec-head">
            <div>
              <span className="tag">Süreç</span>
              <h2 id="h-nasil" className="h-xl">Talep oluşturmak 4 adım</h2>
            </div>
            <p>Her talebi uzman ekip okur.</p>
          </header>
          <HowSteps />
          <div className="steps-cta">
            <a className="btn btn-primary" href="/talep-olustur">İlk adımı at</a>
            <a className="text-link" href="/nasil-calisir">Sürecin ayrıntıları</a>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- ÖRNEK İŞLER */}
      <section className="section bg-gray" id="ornek-isler" aria-labelledby="h-isler">
        <div className="wrap">
          <header className="sec-head">
            <div>
              <span className="tag">Örnek işler</span>
              <h2 id="h-isler" className="h-xl">Fotoğraftan arayüze.</h2>
            </div>
            <p id="isler-not">
              Seçilmiş işler bu alanda yayımlanacak.
            </p>
          </header>
          <ul className="works2" id="isler">
            {PORTFOLIO_PH.map((w, i) => (
              <li key={i} className={`w w-${i + 1}`} data-slot={i}>
                <figure className="w-fig">
                  <span className="w-media"><Ph n={w.n} text={w.baslik} ratio={w.ratio} /></span>
                  <figcaption className="w-cap">
                    <span className="w-kat">{w.kategori}</span>
                    <span className="w-title">{w.baslik}</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- BÜTÇE REHBERİ */}
      {first ? (
        <section className="section" id="butce-rehberi" aria-labelledby="h-rehber">
          <div className="wrap calc-grid">
            <div className="calc-intro">
              <span className="tag">Bütçe rehberi</span>
              <h2 id="h-rehber" className="h-xl">Bütçen ne kadar iş karşılar?</h2>
              <p className="lead">Hizmeti seç, bütçeni yaz.</p>
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
              <button type="submit" className="btn btn-signal btn-lg btn-block">Bu bilgilerle talep oluştur</button>
              <p className="small muted calc-foot">Fiyatlar Brif başlangıç rehberidir. Kesin fiyat, kapsam netleşince yazılı verilir.</p>
              <script id="hesap-data" type="application/json" dangerouslySetInnerHTML={{ __html: safeJson(calc) }} />
            </form>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- ÇALIŞMA MODELİ */}
      <section className="section bg-mint" id="guven" aria-labelledby="h-guven">
        <div className="wrap trust2">
          <div className="trust2-intro">
            <span className="tag">Çalışma modeli</span>
            <h2 id="h-guven" className="h-xl">Talebini kim değerlendiriyor?</h2>
            <p className="lead">Uzman ekip okur ve sana döner.</p>
            <a className="btn btn-primary" href="/talep-olustur">Talebini gönder</a>
          </div>
          <ol className="trust2-list">
            {[
              ["Uzman okur", "Eksik bilgi varsa önce sorulur."],
              ["Kapsam yazılı", "Teslim, revizyon ve tarih baştan belli."],
              ["Bütçene göre yön", "Düşükse reddedilmez, kapsam küçülür."],
              ["Tek numarayla takip", "Her talebe bir takip numarası."],
            ].map(([t, d], i) => (
              <li key={i}>
                <span className="t2-n" aria-hidden="true"><Icon name={["pk-kisi", "pk-liste", "pk-plan", "pk-gorev"][i]} size={34} /></span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- SSS */}
      <section className="section" aria-labelledby="h-sss">
        <div className="wrap faq2">
          <div className="faq2-head">
            <span className="tag">SSS</span>
            <h2 id="h-sss" className="h-xl">Sık sorulan sorular</h2>
            <p><a className="text-link" href="/sss">Tüm sorular</a></p>
          </div>
          <FaqList items={generalFaq.slice(0, 4)} />
        </div>
      </section>

      <section className="section section-tight seo-copy" aria-labelledby="h-hakkinda">
        <div className="wrap narrow prose">
          <h2 id="h-hakkinda">Fotoğraf, tasarım, web ve dijital pazarlama hizmeti almak</h2>
          <p>
            <a href="/hizmetler/urun-fotografcisi">Ürün fotoğrafçısı</a>, <a href="/hizmetler/grafik-tasarim">grafik tasarımcı</a>, <a href="/hizmetler/reels-video-cekimi">Reels çekimi</a>, <a href="/hizmetler/sosyal-medya-yonetimi">sosyal medya yönetimi</a> ya da <a href="/hizmetler/meta-reklam-yonetimi">Meta reklam yönetimi</a> arıyorsan: form hizmete göre soru sorar, fiyat kapsamla netleşir.
          </p>
        </div>
      </section>

      <CtaBand title="Ne istediğini biliyorsan başlayalım." text="Bilmiyorsan da sorun değil; form seni adım adım yönlendirir." label="Projen için talep oluştur" />
    </>
  );
}

export function HowSteps() {
  const steps: [string, string, string, string][] = [
    ["İhtiyacını anlat", "Kategoriyi ve hizmeti seç, hizmete özel birkaç soruyu yanıtla. Bilmediğin yerleri boş bırakabilirsin.", "~3 dakika", "pk-fikir"],
    ["Bütçeni belirle", "Hedef bütçeni yaz ya da teklif istediğini belirt. Rehber, kapsamla uyumunu gösterir.", "TL, kesin değil", "pk-plan"],
    ["Talebin değerlendirilir", "Talebin alanına uygun uzman ekibe düşer. Eksik bilgi varsa önce sorulur.", "Uzman ekip", "pk-incele"],
    ["Süreç başlar", "Seçtiğin kanaldan dönüş yapılır; kapsam, tarih ve fiyat yazılı olarak netleşir.", "Yazılı kapsam", "pk-takvim"],
  ];
  return (
    <div className="steps-ed">
      <svg className="steps-line" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40 C 150 0, 250 60, 400 30 S 650 0, 800 32 S 1050 60, 1200 20" fill="none" />
      </svg>
      <ol>
        {steps.map(([t, d, chip, ico], i) => (
          <li key={i} className="step-ed">
            <span className="step-top" aria-hidden="true">
              <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="step-ico"><Icon name={ico} size={40} /></span>
            </span>
            <span className="step-dot" aria-hidden="true" />
            <h3>
              <span className="sr">Adım {i + 1}: </span>
              {t}
            </h3>
            <p>{d}</p>
            <span className="step-chip">{chip}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ ALAN SAYFALARI (Stüdyo / Tasarım / Dijital): portfolyo
// Izgara Worker tarafından Admin → Örnek işler'deki görsellerle doldurulur; iş yoksa yer tutucular görünür.
const PF_SHAPES = ["r-45", "r-11", "r-32", "r-34", "r-169", "r-45", "r-11", "r-34", "r-32"];
export function HubPage({ hub }: { hub: Hub; posts?: { href: string; baslik: string }[] }) {
  const first = hub.kategoriler[0];
  const ph = PF_SHAPES.map((r, i) => `<figure class="pf-item pf-ph ${r}"><span>${String(i + 1).padStart(2, "0")}</span></figure>`).join("");
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

      <section className="pf-sec" aria-label={`${hub.ad} işleri`}>
        <div className="wrap">
          <div className="pf-grid" data-alan={hub.key} dangerouslySetInnerHTML={{ __html: `<!--ISLER:${hub.key}-->${ph}<!--/ISLER-->` }} />
        </div>
      </section>

      <CtaBand title="Sıradaki iş seninki olsun." text="Kapsamı yaz, yazılı teklifle dönüş yapalım." label="Talep oluştur" href={`/talep-olustur?kategori=${first}`} />

      <section className="section section-tight pf-faq" aria-labelledby="h-hub-sss">
        <div className="wrap narrow">
          <h2 id="h-hub-sss" className="h-sm">Sık sorulanlar</h2>
          <FaqList items={hub.sss} />
          <p className="small muted">Rehber fiyatlar: {hub.fiyat.join(" · ")}. <a href="/fiyat-rehberi">Fiyat rehberi</a></p>
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
      <section className="page-head svc-hero">
        <div className="wrap svc-narrow svc-hero-grid">
          <div>
            <Breadcrumbs items={[{ name: "Ana sayfa", path: "/" }, { name: "Hizmetler", path: "/hizmetler" }]} />
            <h1>Hizmetler</h1>
            <p className="lead">Bir kategori seç; alt hizmeti ve detayları talep formunda birlikte belirleyelim.</p>
            <ul className="svc-hero-facts">
              <li><Icon name="pk-liste" size={26} />6 kategori, {SERVICES.length} hizmet</li>
              <li><Icon name="pk-sohbet" size={26} />Hizmete özel sorular</li>
              <li><Icon name="pk-zaman" size={26} />Yaklaşık 3 dakika</li>
            </ul>
          </div>
          <img className="svc-hero-art" src="/assets/freelancer-masa.webp" alt="" width="820" height="1060" decoding="async" fetchPriority="high" />
        </div>
      </section>
      <div className="wrap svc-narrow svc-page">
        <ul className="svc-grid">
          {CATEGORIES.map((c, i) => {
            const subs = servicesOf(c.slug);
            return (
              <li key={c.slug} id={c.slug}>
                <a className="svc-tile" href={`/talep-olustur?kategori=${c.slug}`} aria-label={`${c.name}: talep oluştur`}>
                  <span className="svc-art">
                    <CatImg slug={c.slug} />
                  </span>
                  <span className="svc-body2">
                    <span className="svc-top">
                      <span className="svc-n">{String(i + 1).padStart(2, "0")}</span>
                      <span className="svc-count-sm">{subs.length} hizmet</span>
                    </span>
                    <span className="svc-title">{c.name}</span>
                    <span className="svc-short">{c.short}</span>
                    <span className="svc-go">
                      Talep oluştur
                      <Icon name="ok" size={18} />
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>

        {guides.length ? (
          <nav className="svc-guides" aria-label="Hizmet rehberleri">
            <p className="tag">Hizmet rehberleri</p>
            <ul>
              {guides.map((x) => (
                <li key={x.slug}><a href={`/hizmetler/${x.page}`}>{x.name}</a></li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
      <CtaBand title="Aradığın hizmeti bulamadın mı?" text="En yakın kategoriyi seç ve açıklama alanında ihtiyacını anlat." />
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
