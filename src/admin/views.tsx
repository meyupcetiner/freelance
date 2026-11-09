import type { ReactNode } from "react";
import type { User } from "../lib/security";
import type { Category, Page, Service, Settings, Status } from "../lib/repo";
import { asset } from "../lib/assets";
import { themeCss } from "../views/Layout";
import { tl, type Question } from "../lib/pricing";

export const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }) : "—";
export const fmtD = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }) : "—");

export const TIMING_LABEL: Record<string, string> = {
  acil: "Acil",
  "1-hafta": "1 hafta içinde",
  "2-4-hafta": "2–4 hafta içinde",
  "belirli-tarih": "Belirli tarih",
  "belli-degil": "Belli değil",
};
export const PREF_LABEL: Record<string, string> = { email: "E-posta", phone: "Telefon", whatsapp: "WhatsApp" };

const FLASH: Record<string, string> = {
  saved: "Değişiklikler kaydedildi.",
  created: "Kayıt oluşturuldu.",
  deleted: "Kayıt silindi.",
  status: "Durum güncellendi.",
  note: "Not eklendi.",
  contact: "İletişim tarihi kaydedildi.",
  password: "Parola güncellendi.",
};

export function AdminLayout({ title, user, csrf, s, children, active, flash, error }: { title: string; user: User | null; csrf: string; s: Settings; children: ReactNode; active?: string; flash?: string | null; error?: string | null }) {
  const nav: [string, string, string, boolean][] = [
    ["overview", "/admin", "Genel bakış", user?.role === "admin"],
    ["requests", "/admin/talepler", "Talepler", user?.role === "admin"],
    ["services", "/admin/hizmetler", "Hizmetler ve fiyatlar", true],
    ["pages", "/admin/sayfalar", "Sayfalar", true],
    ["statuses", "/admin/durumlar", "Talep durumları", user?.role === "admin"],
    ["settings", "/admin/ayarlar", "Ayarlar", user?.role === "admin"],
    ["users", "/admin/kullanicilar", "Kullanıcılar", user?.role === "admin"],
  ];
  return (
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{`${title} — ${s.brand_name} yönetim`}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href={asset("/assets/fonts/brand.css")} />
        <link rel="stylesheet" href={asset("/styles.css")} />
        <style dangerouslySetInnerHTML={{ __html: themeCss(s) }} />
      </head>
      <body className="adm">
        {user ? (
          <div className="adm-shell">
            <aside className="adm-side">
              <div className="adm-brand">
                <a href="/admin">{s.brand_name}</a>
                <button type="button" className="adm-menu" aria-label="Menü">☰</button>
              </div>
              <nav aria-label="Yönetim menüsü">
                <ul>
                  {nav
                    .filter((n) => n[3])
                    .map(([k, href, label]) => (
                      <li key={k}>
                        <a href={href} aria-current={active === k ? "page" : undefined}>{label}</a>
                      </li>
                    ))}
                </ul>
              </nav>
              <div className="adm-user">
                <p>
                  {user.name}
                  <span className="block small muted">{user.role === "admin" ? "Yönetici" : "Editör"}</span>
                </p>
                <a href="/admin/hesap" className="small">Parolamı değiştir</a>
                <a href="/" className="small" target="_blank" rel="noopener">Siteyi aç</a>
                <form method="post" action="/admin/cikis">
                  <input type="hidden" name="csrf" value={csrf} />
                  <button type="submit" className="linklike small">Çıkış yap</button>
                </form>
              </div>
            </aside>
            <main className="adm-main" id="icerik">
              {flash && FLASH[flash] ? <p className="flash ok" role="status">{FLASH[flash]}</p> : null}
              {error ? <p className="flash err" role="alert">{error}</p> : null}
              {children}
            </main>
          </div>
        ) : (
          <main className="adm-login" id="icerik">{children}</main>
        )}
        <script type="module" src={asset("/assets/admin.js")} />
      </body>
    </html>
  );
}

export function Csrf({ t }: { t: string }) {
  return <input type="hidden" name="csrf" value={t} />;
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={"badge tone-" + tone}>{children}</span>;
}

// ------------------------------------------------------------------ GİRİŞ
export function LoginView({ error, r, email }: { error?: string; r: string; email?: string }) {
  return (
    <div className="login-card">
      <h1>Yönetim paneli</h1>
      {error ? <p className="flash err" role="alert">{error}</p> : null}
      <form method="post" action="/admin/giris" className="stack">
        <input type="hidden" name="r" value={r} />
        <div className="field">
          <label htmlFor="l-email">E-posta</label>
          <input id="l-email" name="email" type="email" autoComplete="username" required defaultValue={email} />
        </div>
        <div className="field">
          <label htmlFor="l-pw">Parola</label>
          <input id="l-pw" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn btn-primary btn-block" type="submit">Giriş yap</button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ GENEL BAKIŞ
export interface Overview {
  total: number;
  last7: number;
  last30: number;
  byStatus: { label: string; tone: string; n: number }[];
  byCategory: { name: string; n: number }[];
  funnel: { label: string; n: number }[];
  steps: { step: number; n: number }[];
  topPages: { path: string; n: number }[];
  bySource: { source: string; n: number }[];
  warnedPct: number | null;
  alerts: { text: string; href?: string }[];
  recent: { id: number; ref: string; created_at: string; service_name: string; contact_name: string; label: string; tone: string }[];
}

export function OverviewView({ o }: { o: Overview }) {
  const maxCat = Math.max(1, ...o.byCategory.map((c) => c.n));
  const stepNames = ["Hizmet", "Detaylar", "Bütçe", "Zamanlama", "İletişim", "Özet"];
  const maxStep = Math.max(1, ...o.steps.map((s) => s.n));
  return (
    <>
      <h1>Genel bakış</h1>
      {o.alerts.length ? (
        <section className="alerts" aria-label="Yayın öncesi kontroller">
          <h2 className="h-sm">Yapılması gerekenler</h2>
          <ul>
            {o.alerts.map((a, i) => (
              <li key={i}>{a.href ? <a href={a.href}>{a.text}</a> : a.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="kpis">
        <div><span className="kpi-n">{o.total}</span><span className="kpi-l">Toplam talep</span></div>
        <div><span className="kpi-n">{o.last7}</span><span className="kpi-l">Son 7 gün</span></div>
        <div><span className="kpi-n">{o.last30}</span><span className="kpi-l">Son 30 gün</span></div>
        <div><span className="kpi-n">{o.warnedPct === null ? "—" : o.warnedPct + "%"}</span><span className="kpi-l">Bütçe uyarısı alan talepler</span></div>
      </div>
      {o.total === 0 ? (
        <div className="empty">
          <h2>Henüz talep yok</h2>
          <p>İlk talep geldiğinde burada durum ve kategori dağılımı görünecek. Talep formunu kendin deneyerek akışı test edebilirsin; test talebini sonra silebilirsin.</p>
          <a className="btn btn-primary" href="/talep-olustur" target="_blank" rel="noopener">Talep formunu aç</a>
        </div>
      ) : (
        <div className="grid-2">
          <section className="panel">
            <h2 className="h-sm">Durumlara göre</h2>
            <ul className="stat-list">
              {o.byStatus.map((s) => (
                <li key={s.label}><Badge tone={s.tone}>{s.label}</Badge><span>{s.n}</span></li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2 className="h-sm">Kategoriye göre</h2>
            <ul className="bars">
              {o.byCategory.map((c) => (
                <li key={c.name}>
                  <span className="bar-l">{c.name}</span>
                  <span className="bar"><span style={{ width: (c.n / maxCat) * 100 + "%" }} /></span>
                  <span className="bar-n">{c.n}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <section className="panel">
        <h2 className="h-sm">Son 30 gün: talep formu hunisi</h2>
        <p className="small muted">Anonim ve toplu sayımlar. Kişi, cihaz veya IP bilgisi tutulmaz; bu yüzden aynı kişinin tekrar ziyaretleri ayrı sayılır.</p>
        {o.funnel.every((f) => f.n === 0) ? (
          <p className="empty-inline">Henüz ölçüm verisi yok. Site ziyaret edildikçe burada dolacak.</p>
        ) : (
          <>
            <div className="kpis kpis-sm">
              {o.funnel.map((f) => (
                <div key={f.label}><span className="kpi-n">{f.n}</span><span className="kpi-l">{f.label}</span></div>
              ))}
            </div>
            <h3 className="h-xs">Adımlara ulaşma</h3>
            <ul className="bars">
              {o.steps.map((s) => (
                <li key={s.step}>
                  <span className="bar-l">{s.step}. {stepNames[s.step - 1] || ""}</span>
                  <span className="bar"><span style={{ width: (s.n / maxStep) * 100 + "%" }} /></span>
                  <span className="bar-n">{s.n}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <div className="grid-2">
        <section className="panel">
          <h2 className="h-sm">En çok görüntülenen sayfalar (30 gün)</h2>
          {o.topPages.length ? (
            <table className="tbl tbl-compact"><tbody>{o.topPages.map((p) => <tr key={p.path}><td>{p.path}</td><td className="num">{p.n}</td></tr>)}</tbody></table>
          ) : <p className="empty-inline">Veri yok.</p>}
        </section>
        <section className="panel">
          <h2 className="h-sm">Taleplerin kaynağı</h2>
          {o.bySource.length ? (
            <table className="tbl tbl-compact"><tbody>{o.bySource.map((p) => <tr key={p.source}><td>{p.source}</td><td className="num">{p.n}</td></tr>)}</tbody></table>
          ) : <p className="empty-inline">Veri yok.</p>}
        </section>
      </div>
      {o.recent.length ? (
        <section className="panel">
          <h2 className="h-sm">Son talepler</h2>
          <table className="tbl">
            <tbody>
              {o.recent.map((r) => (
                <tr key={r.id}>
                  <td><a href={`/admin/talepler/${r.id}`}>{r.ref}</a></td>
                  <td>{r.service_name}</td>
                  <td>{r.contact_name}</td>
                  <td><Badge tone={r.tone}>{r.label}</Badge></td>
                  <td className="muted">{fmtDT(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ TALEPLER
export interface RequestRow {
  id: number;
  ref: string;
  created_at: string;
  service_name: string;
  budget_amount: number | null;
  budget_mode: string;
  budget_warned: number;
  timing: string;
  contact_name: string;
  status_label: string;
  status_tone: string;
  last_contact_at: string | null;
}

export function RequestsView({ rows, total, page, pages, f, statuses, cats }: { rows: RequestRow[]; total: number; page: number; pages: number; f: Record<string, string>; statuses: Status[]; cats: Category[] }) {
  const qs = (patch: Record<string, string>) => "?" + new URLSearchParams(Object.entries({ ...f, ...patch }).filter(([, v]) => v)).toString();
  return (
    <>
      <div className="adm-head">
        <h1>Talepler <span className="muted">({total})</span></h1>
        <a className="btn btn-ghost btn-sm" href={"/admin/talepler.csv" + qs({ sayfa: "" })}>CSV indir</a>
      </div>
      <form className="filters" method="get" role="search">
        <div className="field">
          <label htmlFor="f-q">Ara</label>
          <input id="f-q" name="q" type="search" defaultValue={f.q} placeholder="Talep no, ad, e-posta, telefon, açıklama" />
        </div>
        <div className="field">
          <label htmlFor="f-d">Durum</label>
          <select id="f-d" name="durum" defaultValue={f.durum} data-autosubmit="">
            <option value="">Tümü</option>
            <option value="acik">Açık olanlar</option>
            {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-k">Kategori</label>
          <select id="f-k" name="kategori" defaultValue={f.kategori} data-autosubmit="">
            <option value="">Tümü</option>
            {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            <option value="diger">Başka bir hizmet</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-s">Sırala</label>
          <select id="f-s" name="sirala" defaultValue={f.sirala} data-autosubmit="">
            <option value="">En yeni</option>
            <option value="eski">En eski</option>
            <option value="butce">Bütçe (yüksekten)</option>
            <option value="iletisim">Son iletişim (eskiden)</option>
          </select>
        </div>
        <button className="btn btn-primary btn-sm" type="submit">Filtrele</button>
        {Object.values(f).some(Boolean) ? <a className="text-link small" href="/admin/talepler">Temizle</a> : null}
      </form>
      {rows.length === 0 ? (
        <div className="empty">
          <h2>{Object.values(f).some(Boolean) ? "Bu filtrelerle talep bulunamadı" : "Henüz talep yok"}</h2>
          <p>{Object.values(f).some(Boolean) ? "Filtreleri değiştirmeyi ya da temizlemeyi dene." : "Talep formundan gelen kayıtlar burada listelenecek."}</p>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>No</th><th>Tarih</th><th>Hizmet</th><th>Bütçe</th><th>Zamanlama</th><th>Ad</th><th>Durum</th><th>Son iletişim</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><a href={`/admin/talepler/${r.id}`} className="strong">{r.ref}</a></td>
                  <td className="nowrap">{fmtDT(r.created_at)}</td>
                  <td>{r.service_name}</td>
                  <td className="nowrap">
                    {r.budget_mode === "quote" ? <span className="muted">Teklif istiyor</span> : tl(r.budget_amount || 0)}
                    {r.budget_warned ? <span className="dot-warn" title="Bütçe rehberin altında">!</span> : null}
                  </td>
                  <td>{TIMING_LABEL[r.timing] || r.timing}</td>
                  <td>{r.contact_name}</td>
                  <td><Badge tone={r.status_tone}>{r.status_label}</Badge></td>
                  <td className="nowrap muted">{fmtD(r.last_contact_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav className="pager" aria-label="Sayfalar">
          {page > 1 ? <a href={qs({ sayfa: String(page - 1) })}>Önceki</a> : <span />}
          <span>Sayfa {page} / {pages}</span>
          {page < pages ? <a href={qs({ sayfa: String(page + 1) })}>Sonraki</a> : <span />}
        </nav>
      ) : null}
    </>
  );
}

export function RequestDetailView({ r, csrf, statuses, questions, activity }: { r: any; csrf: string; statuses: Status[]; questions: Question[]; activity: { kind: string; body: string; created_at: string; user_name: string | null }[] }) {
  const answers: Record<string, string | string[]> = JSON.parse(r.answers || "{}");
  const label = (key: string) => questions.find((q) => q.key === key)?.label ?? key;
  const val = (key: string, v: string | string[]) => {
    const q = questions.find((x) => x.key === key);
    const vals = Array.isArray(v) ? v : [v];
    return vals.map((x) => q?.options?.find((o) => o.value === x)?.label ?? x).join(", ");
  };
  const wa = r.contact_phone ? "https://wa.me/" + String(r.contact_phone).replace(/\D/g, "").replace(/^0/, "90") : "";
  return (
    <>
      <p className="small"><a href="/admin/talepler">Tüm talepler</a></p>
      <div className="adm-head">
        <h1>{r.ref} <span className="muted">{r.service_name}</span></h1>
        <Badge tone={r.status_tone}>{r.status_label}</Badge>
      </div>
      <div className="grid-detail">
        <div className="stack">
          <section className="panel">
            <h2 className="h-sm">İşin detayları</h2>
            <dl className="kv">
              {Object.entries(answers).filter(([k]) => k !== "__hizmet").map(([k, v]) => (
                <div key={k}><dt>{label(k)}</dt><dd>{val(k, v)}</dd></div>
              ))}
              <div><dt>Açıklama</dt><dd className="pre">{r.description || "—"}</dd></div>
            </dl>
          </section>
          <section className="panel">
            <h2 className="h-sm">Bütçe ve zamanlama</h2>
            <dl className="kv">
              <div><dt>Bütçe</dt><dd>{r.budget_mode === "quote" ? "Teklif istiyor" : tl(r.budget_amount || 0)}</dd></div>
              <div><dt>Rehber alt sınır</dt><dd>{r.estimate_min ? tl(r.estimate_min) : "Hesaplanmadı"}{r.budget_warned ? <> <Badge tone="warn">Bütçe rehberin altında</Badge></> : null}</dd></div>
              <div><dt>Zamanlama</dt><dd>{TIMING_LABEL[r.timing] || r.timing}{r.timing_date ? ` — ${fmtD(r.timing_date)}` : ""}</dd></div>
            </dl>
          </section>
          <section className="panel">
            <h2 className="h-sm">İşlem geçmişi</h2>
            <ol className="timeline">
              {activity.map((a, i) => (
                <li key={i}>
                  <span className="muted small">{fmtDT(a.created_at)}{a.user_name ? ` — ${a.user_name}` : ""}</span>
                  <p className={a.kind === "note" ? "pre" : ""}>{a.body}</p>
                </li>
              ))}
            </ol>
            <form method="post" className="stack">
              <Csrf t={csrf} />
              <input type="hidden" name="action" value="note" />
              <div className="field">
                <label htmlFor="n-body">Yönetici notu</label>
                <textarea id="n-body" name="body" rows={3} maxLength={2000} required />
              </div>
              <button className="btn btn-ghost btn-sm" type="submit">Not ekle</button>
            </form>
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <h2 className="h-sm">İletişim</h2>
            <dl className="kv">
              <div><dt>Ad</dt><dd>{r.contact_name}</dd></div>
              {r.company ? <div><dt>Firma</dt><dd>{r.company}</dd></div> : null}
              <div><dt>E-posta</dt><dd>{r.contact_email ? <a href={`mailto:${r.contact_email}?subject=${encodeURIComponent("Talebiniz: " + r.ref)}`}>{r.contact_email}</a> : "—"}</dd></div>
              <div><dt>Telefon</dt><dd>{r.contact_phone ? <><a href={`tel:${r.contact_phone.replace(/\s/g, "")}`}>{r.contact_phone}</a>{wa ? <> · <a href={wa} target="_blank" rel="noopener">WhatsApp</a></> : null}</> : "—"}</dd></div>
              <div><dt>Tercih</dt><dd>{PREF_LABEL[r.contact_pref]}</dd></div>
              <div><dt>Son iletişim</dt><dd>{fmtDT(r.last_contact_at)}</dd></div>
            </dl>
            <form method="post">
              <Csrf t={csrf} />
              <input type="hidden" name="action" value="contact" />
              <button className="btn btn-primary btn-sm btn-block" type="submit">Bugün dönüş yaptım</button>
            </form>
          </section>
          <section className="panel">
            <h2 className="h-sm">Durum</h2>
            <form method="post" className="stack">
              <Csrf t={csrf} />
              <input type="hidden" name="action" value="status" />
              <div className="field">
                <label htmlFor="s-id">Talep durumu</label>
                <select id="s-id" name="status_id" defaultValue={String(r.status_id)}>
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <button className="btn btn-ghost btn-sm" type="submit">Durumu güncelle</button>
            </form>
          </section>
          <section className="panel">
            <h2 className="h-sm">Kaynak</h2>
            <dl className="kv small">
              <div><dt>Oluşturma</dt><dd>{fmtDT(r.created_at)}</dd></div>
              <div><dt>UTM</dt><dd>{[r.src_source, r.src_medium, r.src_campaign].filter(Boolean).join(" / ") || "—"}</dd></div>
              <div><dt>Yönlendiren</dt><dd>{r.src_referrer || "Doğrudan"}</dd></div>
              <div><dt>İlk sayfa</dt><dd>{r.src_landing || "—"}</dd></div>
              <div><dt>Aydınlatma onayı</dt><dd>{fmtDT(r.privacy_ack_at)}</dd></div>
            </dl>
          </section>
          <section className="panel danger">
            <h2 className="h-sm">Kalıcı olarak sil</h2>
            <p className="small">Kişinin silme talebi veya saklama süresinin dolması durumunda kullan. Talep ve geçmişi geri getirilemez şekilde silinir.</p>
            <form method="post" data-confirm={`${r.ref} numaralı talep kalıcı olarak silinsin mi?`}>
              <Csrf t={csrf} />
              <input type="hidden" name="action" value="delete" />
              <button className="btn btn-danger btn-sm" type="submit">Talebi sil</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ HİZMETLER
export function ServicesView({ list, isAdmin }: { list: Service[]; isAdmin: boolean }) {
  return (
    <>
      <div className="adm-head">
        <h1>Hizmetler ve fiyatlar</h1>
        {isAdmin ? <a className="btn btn-primary btn-sm" href="/admin/hizmetler/yeni">Yeni hizmet</a> : null}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Hizmet</th><th>Kategori</th><th>Yayın</th><th>Fiyat rehberi</th><th>Güncelleme</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td><a className="strong" href={`/admin/hizmetler/${s.id}`}>{s.name}</a><span className="block small muted">/hizmetler/{s.slug}</span></td>
                <td>{s.category_name}</td>
                <td>{s.published ? <Badge tone="ok">Yayında</Badge> : <Badge tone="muted">Taslak</Badge>}</td>
                <td>
                  {!s.pricing.enabled ? <Badge tone="muted">Kapalı</Badge> : s.pricing.verified ? <Badge tone="ok">Doğrulandı</Badge> : <Badge tone="warn">Doğrulanmadı — rakamlar gizli</Badge>}
                </td>
                <td className="muted nowrap">{fmtD(s.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const QUESTIONS_DOC = `Her soru: {"key":"urun_sayisi","label":"Kaç ürün?","type":"number|radio|checkboxes|select|text|textarea","required":true,"min":1,"max":500,"options":[{"value":"a","label":"A","units":2}]}`;
const ADDONS_DOC = `Her ek: {"key":"rotus","values":["ileri"],"amount":2000,"label":"İleri rötuş"} — ilgili soruda bu değerlerden biri seçilirse alt sınıra eklenir.`;

export function ServiceEditView({ svc, cats, all, csrf, isAdmin, error, form }: { svc: Service | null; cats: Category[]; all: Service[]; csrf: string; isAdmin: boolean; error?: string; form?: Partial<Record<string, string>> }) {
  const v = (k: keyof Service, fb = "") => (form?.[k as string] ?? (svc ? String((svc as any)[k] ?? "") : fb)) as string;
  const pr = svc?.pricing;
  const faq = svc?.faq ?? [];
  const tiers = pr?.tiers ?? [];
  const rows = Math.max(3, faq.length + 2);
  return (
    <>
      <p className="small"><a href="/admin/hizmetler">Tüm hizmetler</a></p>
      <div className="adm-head">
        <h1>{svc ? svc.name : "Yeni hizmet"}</h1>
        {svc?.published ? <a className="text-link small" href={`/hizmetler/${svc.slug}`} target="_blank" rel="noopener">Sayfayı aç</a> : null}
      </div>
      {error ? <p className="flash err" role="alert">{error}</p> : null}
      <form method="post" className="edit-form">
        <Csrf t={csrf} />
        <fieldset className="panel">
          <legend className="h-sm">Temel bilgiler</legend>
          <div className="grid-2">
            <F id="name" label="Hizmet adı" help="Form ve listelerde görünür."><input id="name" name="name" required maxLength={80} defaultValue={v("name")} /></F>
            <F id="slug" label="URL" help="Yalnızca küçük harf, rakam ve tire. Yayındaki bir hizmetin URL'sini değiştirmek arama sıralamasını etkileyebilir.">
              <div className="prefix"><span>/hizmetler/</span><input id="slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} defaultValue={v("slug")} /></div>
            </F>
            <F id="category_id" label="Kategori">
              <select id="category_id" name="category_id" defaultValue={v("category_id")}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </F>
            <F id="sort" label="Sıra"><input id="sort" name="sort" type="number" min={0} max={999} defaultValue={v("sort", "0")} /></F>
          </div>
          <F id="summary" label="Kısa açıklama" help="Hizmet listelerinde görünür (en fazla 160 karakter)."><input id="summary" name="summary" maxLength={160} defaultValue={v("summary")} /></F>
          <label className="check"><input type="checkbox" name="published" value="1" defaultChecked={svc ? svc.published : false} /> Yayında</label>
        </fieldset>

        <fieldset className="panel">
          <legend className="h-sm">Arama motoru (SEO)</legend>
          <F id="seo_title" label="SEO başlığı (title)" help="Önerilen: 50–60 karakter. Marka adı otomatik eklenir."><input id="seo_title" name="seo_title" required maxLength={90} defaultValue={v("seo_title")} /></F>
          <F id="meta_description" label="Meta açıklama" help="Önerilen: 140–160 karakter. Sayfa başlığının altındaki giriş metni olarak da kullanılır."><textarea id="meta_description" name="meta_description" required maxLength={200} rows={2} defaultValue={v("meta_description")} /></F>
          <F id="h1" label="Sayfa başlığı (H1)"><input id="h1" name="h1" required maxLength={120} defaultValue={v("h1")} /></F>
        </fieldset>

        <fieldset className="panel">
          <legend className="h-sm">Sayfa içeriği</legend>
          <F id="body" label="İçerik" help="## Ara başlık, ### alt başlık, - madde, 1. sıralı madde, **kalın**, [bağlantı](/hizmetler/...) desteklenir. HTML kullanılamaz.">
            <textarea id="body" name="body" rows={18} maxLength={20000} className="mono" defaultValue={v("body")} />
          </F>
          <div className="grid-2">
            <F id="image_url" label="Görsel adresi" help="İsteğe bağlı. Optimize edilmiş (WebP/JPG, ~1600px) bir görselin adresi."><input id="image_url" name="image_url" maxLength={500} defaultValue={v("image_url")} /></F>
            <F id="image_alt" label="Görsel alternatif metni"><input id="image_alt" name="image_alt" maxLength={200} defaultValue={v("image_alt")} /></F>
          </div>
        </fieldset>

        <fieldset className="panel">
          <legend className="h-sm">Sık sorulan sorular</legend>
          <p className="small muted">Boş bırakılan satırlar kaydedilmez. Daha fazla satır için kaydedip sayfayı yeniden aç.</p>
          {Array.from({ length: rows }).map((_, i) => (
            <div className="grid-faq" key={i}>
              <input name="faq_q" aria-label={`Soru ${i + 1}`} placeholder="Soru" maxLength={200} defaultValue={faq[i]?.q} />
              <textarea name="faq_a" aria-label={`Cevap ${i + 1}`} placeholder="Cevap" rows={2} maxLength={1000} defaultValue={faq[i]?.a} />
            </div>
          ))}
        </fieldset>

        <fieldset className="panel">
          <legend className="h-sm">İlgili hizmetler</legend>
          <div className="check-grid">
            {all.filter((x) => x.id !== svc?.id).map((x) => (
              <label className="check" key={x.slug}><input type="checkbox" name="related" value={x.slug} defaultChecked={svc?.related.includes(x.slug)} /> {x.name}</label>
            ))}
          </div>
        </fieldset>

        <fieldset className="panel">
          <legend className="h-sm">Talep formu soruları</legend>
          <F id="questions" label="Sorular (JSON)" help={QUESTIONS_DOC}>
            <textarea id="questions" name="questions" data-json="" rows={14} className="mono" defaultValue={form?.questions ?? JSON.stringify(svc?.questions ?? [], null, 2)} />
          </F>
        </fieldset>

        <fieldset className="panel">
          <legend className="h-sm">Fiyat rehberi</legend>
          <p className="small muted">
            Alt sınır = taban + (birim × birim fiyatı) + seçilen eklerin toplamı. Müşterinin bütçesi bu değerin altındaysa formda nazik bir uyarı görünür. Rakamlar yalnızca "doğrulandı" işaretliyken ziyaretçiye gösterilir; doğrulanmamışken uyarı metni rakamsız çıkar.
          </p>
          <div className="grid-3">
            <label className="check"><input type="checkbox" name="pr_enabled" value="1" defaultChecked={pr?.enabled} /> Fiyat rehberi açık</label>
            <label className="check"><input type="checkbox" name="pr_verified" value="1" defaultChecked={pr?.verified} /> Rakamları doğruladım, yayımlanabilir</label>
          </div>
          <div className="grid-3">
            <F id="pr_base" label="Taban tutar (₺)"><input id="pr_base" name="pr_base" type="number" min={0} step={50} defaultValue={pr?.base ?? 0} /></F>
            <F id="pr_perUnit" label="Birim başına (₺)"><input id="pr_perUnit" name="pr_perUnit" type="number" min={0} step={50} defaultValue={pr?.perUnit ?? 0} /></F>
            <F id="pr_unitKey" label="Birimi veren soru">
              <select id="pr_unitKey" name="pr_unitKey" defaultValue={pr?.unitKey ?? ""}>
                <option value="">Yok</option>
                {(svc?.questions ?? []).filter((q) => q.type === "number" || q.options?.some((o) => o.units !== undefined)).map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
              </select>
            </F>
            <F id="pr_unitLabel" label="Birim adı"><input id="pr_unitLabel" name="pr_unitLabel" maxLength={40} defaultValue={pr?.unitLabel} placeholder="ürün, saat, video" /></F>
            <F id="pr_budgetHint" label="Bütçe sorusu notu"><input id="pr_budgetHint" name="pr_budgetHint" maxLength={160} defaultValue={pr?.budgetHint} /></F>
            <F id="pr_source" label="Rakamların kaynağı"><input id="pr_source" name="pr_source" maxLength={160} defaultValue={pr?.source} /></F>
          </div>
          <F id="pr_note" label="Açıklama notu"><input id="pr_note" name="pr_note" maxLength={240} defaultValue={pr?.note} /></F>
          <F id="pr_addons" label="Ekler (JSON)" help={ADDONS_DOC}>
            <textarea id="pr_addons" name="pr_addons" data-json="" rows={6} className="mono" defaultValue={form?.pr_addons ?? JSON.stringify(pr?.addons ?? [], null, 2)} />
          </F>
          <h3 className="h-xs">Kapsam seviyeleri</h3>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="grid-tier" key={i}>
              <input name="tier_name" aria-label={`Seviye ${i + 1} adı`} placeholder="Ad" maxLength={40} defaultValue={tiers[i]?.name} />
              <input name="tier_from" aria-label={`Seviye ${i + 1} başlangıç`} type="number" min={0} placeholder="Başlangıç ₺" defaultValue={tiers[i]?.from} />
              <input name="tier_to" aria-label={`Seviye ${i + 1} üst sınır`} type="number" min={0} placeholder="Üst sınır ₺ (boş = sınırsız)" defaultValue={tiers[i]?.to ?? ""} />
              <input name="tier_inc" aria-label={`Seviye ${i + 1} kapsamı`} placeholder="Kapsam (virgülle)" maxLength={300} defaultValue={tiers[i]?.includes.join(", ")} />
            </div>
          ))}
          {pr?.updatedAt ? <p className="small muted">Fiyat rehberi son güncelleme: {fmtD(pr.updatedAt)}</p> : null}
        </fieldset>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" name="action" value="save">Kaydet</button>
        </div>
      </form>
      {svc && isAdmin ? (
        <form method="post" className="panel danger" data-confirm={`"${svc.name}" hizmeti silinsin mi? Bu hizmete bağlı talepler korunur.`}>
          <Csrf t={csrf} />
          <input type="hidden" name="action" value="delete" />
          <h2 className="h-sm">Hizmeti sil</h2>
          <p className="small">Silmek yerine yayından kaldırmak genellikle daha iyidir; silinen sayfanın adresi 404 döner.</p>
          <button className="btn btn-danger btn-sm" type="submit">Hizmeti sil</button>
        </form>
      ) : null}
    </>
  );
}

function F({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help ? <p className="help">{help}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ SAYFALAR
export function PagesView({ list }: { list: Page[] }) {
  return (
    <>
      <div className="adm-head">
        <h1>Sayfalar</h1>
        <a className="btn btn-primary btn-sm" href="/admin/sayfalar/yeni">Yeni sayfa</a>
      </div>
      <table className="tbl">
        <thead><tr><th>Sayfa</th><th>Tür</th><th>Durum</th><th>Güncelleme</th></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td><a className="strong" href={`/admin/sayfalar/${p.id}`}>{p.title}</a><span className="block small muted">/{p.slug}</span></td>
              <td>{p.is_legal ? (p.reviewed ? <Badge tone="ok">Yasal, incelendi</Badge> : <Badge tone="warn">Yasal, taslak</Badge>) : "İçerik"}</td>
              <td>{p.published ? <Badge tone="ok">Yayında</Badge> : <Badge tone="muted">Taslak</Badge>}</td>
              <td className="muted">{fmtD(p.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function PageEditView({ p, csrf, error }: { p: Partial<Page> | null; csrf: string; error?: string }) {
  return (
    <>
      <p className="small"><a href="/admin/sayfalar">Tüm sayfalar</a></p>
      <h1>{p?.id ? p.title : "Yeni sayfa"}</h1>
      {error ? <p className="flash err" role="alert">{error}</p> : null}
      <form method="post" className="edit-form">
        <Csrf t={csrf} />
        <fieldset className="panel">
          <div className="grid-2">
            <F id="title" label="Başlık (H1)"><input id="title" name="title" required maxLength={120} defaultValue={p?.title} /></F>
            <F id="slug" label="URL"><div className="prefix"><span>/</span><input id="slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} defaultValue={p?.slug} /></div></F>
          </div>
          <F id="seo_title" label="SEO başlığı"><input id="seo_title" name="seo_title" required maxLength={90} defaultValue={p?.seo_title} /></F>
          <F id="meta_description" label="Meta açıklama"><textarea id="meta_description" name="meta_description" rows={2} required maxLength={200} defaultValue={p?.meta_description} /></F>
          <F id="body" label="İçerik" help="Hizmet içerikleriyle aynı biçim kuralları. > ile başlayan satır not kutusu olur."><textarea id="body" name="body" rows={20} maxLength={40000} className="mono" defaultValue={p?.body} /></F>
          <div className="grid-3">
            <label className="check"><input type="checkbox" name="published" value="1" defaultChecked={p ? !!p.published : true} /> Yayında</label>
            <label className="check"><input type="checkbox" name="is_legal" value="1" defaultChecked={!!p?.is_legal} /> Yasal metin</label>
            <label className="check"><input type="checkbox" name="reviewed" value="1" defaultChecked={!!p?.reviewed} /> Hukuki inceleme yapıldı</label>
          </div>
        </fieldset>
        <div className="form-actions"><button className="btn btn-primary" type="submit" name="action" value="save">Kaydet</button></div>
      </form>
      {p?.id ? (
        <form method="post" className="panel danger" data-confirm="Sayfa silinsin mi?">
          <Csrf t={csrf} />
          <input type="hidden" name="action" value="delete" />
          <button className="btn btn-danger btn-sm" type="submit">Sayfayı sil</button>
        </form>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ DURUMLAR
export function StatusesView({ list, csrf, usage }: { list: Status[]; csrf: string; usage: Record<number, number> }) {
  const tones = [["info", "Mavi"], ["warn", "Sarı"], ["neutral", "Gri"], ["ok", "Yeşil"], ["muted", "Soluk"]];
  return (
    <>
      <h1>Talep durumları</h1>
      <p className="muted">Listedeki ilk durum, yeni gelen taleplere otomatik atanır. "Kapanmış" durumlar açık talepler filtresine dahil edilmez.</p>
      <form method="post" className="panel">
        <Csrf t={csrf} />
        <input type="hidden" name="action" value="save" />
        <table className="tbl">
          <thead><tr><th>Ad</th><th>Renk</th><th>Kapanmış</th><th>Sıra</th><th>Kullanım</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td><input type="hidden" name="id" value={s.id} /><input name="label" aria-label="Durum adı" required maxLength={40} defaultValue={s.label} /></td>
                <td><select name="tone" aria-label="Renk" defaultValue={s.tone}>{tones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td><select name="is_open" aria-label="Kapanmış mı" defaultValue={s.is_open ? "1" : "0"}><option value="1">Hayır</option><option value="0">Evet</option></select></td>
                <td><input name="sort" type="number" aria-label="Sıra" min={0} max={99} defaultValue={s.sort} className="w-sm" /></td>
                <td className="muted">{usage[s.id] || 0} talep</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-primary btn-sm" type="submit">Kaydet</button>
      </form>
      <form method="post" className="panel inline-form">
        <Csrf t={csrf} />
        <input type="hidden" name="action" value="add" />
        <div className="field"><label htmlFor="ns">Yeni durum</label><input id="ns" name="label" required maxLength={40} /></div>
        <button className="btn btn-ghost btn-sm" type="submit">Ekle</button>
      </form>
      <form method="post" className="panel inline-form" data-confirm="Seçilen durum silinsin mi?">
        <Csrf t={csrf} />
        <input type="hidden" name="action" value="delete" />
        <div className="field">
          <label htmlFor="ds">Kullanılmayan durumu sil</label>
          <select id="ds" name="id">{list.filter((s) => !usage[s.id]).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </div>
        <button className="btn btn-danger btn-sm" type="submit" disabled={list.filter((s) => !usage[s.id]).length === 0 || list.length <= 1}>Sil</button>
      </form>
    </>
  );
}

// ------------------------------------------------------------------ AYARLAR
export function SettingsView({ s, csrf, services }: { s: Settings; csrf: string; services: { mail: boolean; turnstile: boolean; siteUrl: string } }) {
  const I = ({ k, label, help, type = "text" }: { k: keyof Settings; label: string; help?: string; type?: string }) => (
    <F id={k} label={label} help={help}>
      <input id={k} name={k} type={type} maxLength={300} defaultValue={s[k]} />
    </F>
  );
  return (
    <>
      <h1>Ayarlar</h1>
      <form method="post" className="edit-form">
        <Csrf t={csrf} />
        <fieldset className="panel">
          <legend className="h-sm">Marka</legend>
          <div className="grid-2">
            <I k="brand_name" label="Marka adı" help="Başlıklarda, logoda ve yapılandırılmış veride kullanılır." />
            <I k="brand_tagline" label="Kısa tanım" />
            <I k="logo_url" label="Logo adresi" help="Boş bırakılırsa marka adı yazı logosu olarak kullanılır. SVG veya PNG; /uploads/logo.svg gibi." />
            <I k="legal_entity" label="Yasal unvan" help="Footer'daki telif satırında görünür." />
          </div>
          <div className="grid-4">
            <F id="color_primary" label="Ana renk"><input id="color_primary" name="color_primary" type="color" defaultValue={s.color_primary} /></F>
            <F id="color_primary_2" label="İkincil renk"><input id="color_primary_2" name="color_primary_2" type="color" defaultValue={s.color_primary_2} /></F>
            <F id="color_sky" label="Açık mavi"><input id="color_sky" name="color_sky" type="color" defaultValue={s.color_sky} /></F>
            <F id="color_signal" label="Vurgu (CTA)"><input id="color_signal" name="color_signal" type="color" defaultValue={s.color_signal} /></F>
          </div>
          <p className="small muted">Vurgu rengi koyu metinle kullanılır; ana renk beyaz metinle. Değiştirirken kontrastı kontrol et.</p>
        </fieldset>
        <fieldset className="panel">
          <legend className="h-sm">İletişim ve sosyal medya</legend>
          <div className="grid-2">
            <I k="contact_email" label="İletişim e-postası" type="email" />
            <I k="contact_phone" label="Telefon" />
            <I k="contact_whatsapp" label="WhatsApp numarası" />
            <I k="service_area" label="Hizmet bölgesi" help="Hizmet sayfalarının yapılandırılmış verisinde (areaServed) kullanılır. Yalnızca gerçekten hizmet verilen bölgeyi yaz." />
            <I k="social_instagram" label="Instagram adresi" type="url" />
            <I k="social_linkedin" label="LinkedIn adresi" type="url" />
            <I k="social_youtube" label="YouTube adresi" type="url" />
          </div>
        </fieldset>
        <fieldset className="panel">
          <legend className="h-sm">SEO ve ölçüm</legend>
          <I k="seo_default_title" label="Ana sayfa başlığı" />
          <F id="seo_default_description" label="Ana sayfa açıklaması"><textarea id="seo_default_description" name="seo_default_description" rows={2} maxLength={200} defaultValue={s.seo_default_description} /></F>
          <div className="grid-2">
            <I k="og_image_url" label="Paylaşım görseli (1200×630)" help="Boşsa /og-default.png kullanılır." />
            <I k="gsc_verification" label="Search Console doğrulama kodu" help="HTML etiketi yöntemindeki content değeri." />
            <I k="ga4_id" label="Google Analytics 4 ölçüm kimliği" help="G-XXXXXXX. Yalnızca ziyaretçi çerez onayı verirse yüklenir." />
            <I k="retention_days" label="Talep saklama süresi (gün)" help="KVKK aydınlatma metniyle uyumlu olmalı. Panelde bu süreyi aşan talepler işaretlenir." type="number" />
          </div>
        </fieldset>
        <fieldset className="panel">
          <legend className="h-sm">Bildirimler</legend>
          <I k="notify_email" label="Yeni talep bildirimi gönderilecek e-posta" type="email" />
          <p className="small">
            E-posta servisi: {services.mail ? <Badge tone="ok">Yapılandırıldı</Badge> : <Badge tone="warn">Yapılandırılmadı — RESEND_API_KEY ve MAIL_FROM ortam değişkenleri gerekli</Badge>}
          </p>
          <p className="small">
            Bot koruması (Cloudflare Turnstile): {services.turnstile ? <Badge tone="ok">Açık</Badge> : <Badge tone="neutral">Kapalı — bal küpü, süre kontrolü ve hız sınırı aktif</Badge>}
          </p>
          <p className="small">Site adresi (SITE_URL): <code>{services.siteUrl}</code></p>
        </fieldset>
        <div className="form-actions"><button className="btn btn-primary" type="submit">Kaydet</button></div>
      </form>
    </>
  );
}

// ------------------------------------------------------------------ KULLANICILAR
export function UsersView({ list, csrf, me }: { list: any[]; csrf: string; me: number }) {
  return (
    <>
      <h1>Kullanıcılar</h1>
      <p className="muted">Yönetici her şeye erişir. Editör yalnızca hizmetleri, fiyat rehberini ve sayfaları düzenler; talepleri ve kişisel verileri göremez.</p>
      <table className="tbl">
        <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>Son giriş</th><th /></tr></thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role === "admin" ? "Yönetici" : "Editör"}</td>
              <td>{u.active ? <Badge tone="ok">Aktif</Badge> : <Badge tone="muted">Pasif</Badge>}</td>
              <td className="muted">{fmtDT(u.last_login_at)}</td>
              <td>
                {u.id !== me ? (
                  <form method="post">
                    <Csrf t={csrf} />
                    <input type="hidden" name="action" value="toggle" />
                    <input type="hidden" name="id" value={u.id} />
                    <button className="linklike small" type="submit">{u.active ? "Pasifleştir" : "Aktifleştir"}</button>
                  </form>
                ) : <span className="small muted">Sen</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form method="post" className="panel edit-form">
        <Csrf t={csrf} />
        <input type="hidden" name="action" value="create" />
        <h2 className="h-sm">Kullanıcı ekle</h2>
        <div className="grid-2">
          <F id="u-name" label="Ad"><input id="u-name" name="name" required maxLength={80} /></F>
          <F id="u-email" label="E-posta"><input id="u-email" name="email" type="email" required maxLength={160} /></F>
          <F id="u-role" label="Rol"><select id="u-role" name="role"><option value="editor">Editör</option><option value="admin">Yönetici</option></select></F>
          <F id="u-pw" label="Geçici parola" help="En az 12 karakter. Kullanıcıya güvenli bir kanaldan ilet."><input id="u-pw" name="password" type="password" minLength={12} required autoComplete="new-password" /></F>
        </div>
        <button className="btn btn-primary btn-sm" type="submit">Ekle</button>
      </form>
    </>
  );
}

export function AccountView({ csrf }: { csrf: string }) {
  return (
    <>
      <h1>Parolamı değiştir</h1>
      <form method="post" className="panel edit-form narrow-form">
        <Csrf t={csrf} />
        <F id="cur" label="Mevcut parola"><input id="cur" name="current" type="password" required autoComplete="current-password" /></F>
        <F id="np" label="Yeni parola" help="En az 12 karakter."><input id="np" name="password" type="password" minLength={12} required autoComplete="new-password" /></F>
        <button className="btn btn-primary btn-sm" type="submit">Parolayı güncelle</button>
        <p className="small muted">Değişiklikten sonra diğer cihazlardaki oturumların kapanır.</p>
      </form>
    </>
  );
}
