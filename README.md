# Freelance hizmet platformu — MVP

Google'dan hizmet arayan müşteriyi SEO uyumlu hizmet sayfasına, oradan hizmete özel bir iş talebi formuna ve yönetim paneline taşıyan, çalışır durumda bir MVP.

**Şu an çalışanlar:** ana sayfa, 9 hizmet sayfası, hizmet dizini, nasıl çalışır, fiyat rehberi, SSS, düzenlenebilir yasal sayfalar, 404, sitemap/robots; adım adım dinamik talep formu ve hizmete göre bütçe uyarısı; veritabanına kayıt; güvenli yönetim paneli (talepler, durumlar, notlar, CSV, hizmet/SEO/fiyat düzenleme, sayfalar, ayarlar, kullanıcılar/roller); anonim ölçüm ve çerez onaylı GA4.

---

## 1. İş modeli ve varsayımlar

- **Faz A (bugün):** Platform ücretsiz. Talepler kurucu tarafından tek tek okunur ve uygunsa kurucu tarafından karşılanır. Sitede sahte freelancer, yorum, logo veya istatistik **yoktur**; metinler bu manuel süreci açıkça anlatır.
- **Faz B (ileride):** Doğrulanmış freelancerlar, eşleştirme, teklifler. Veri modeli buna hazır (talep durumu "Eşleşme bekleniyor / Eşleşti", hizmet bazlı kapsam soruları, fiyat rehberi), ancak bu özellikler kodlanmadı.

**Yaptığım varsayımlar** (değiştirmek panelden mümkün):

| Konu | Varsayım |
|---|---|
| Marka adı | Geçici olarak **"Brif"**. Logo dosyası mesajda gelmediği için yazı logosu kullanılıyor. Panel → Ayarlar'dan ad, logo ve 4 renk değiştirilebilir. |
| Renkler | Briefteki yaklaşık kodlar (#1F06AC, #1645C0, #587FE5, #E4F34F). Görsel dosyalar gelmediği için ton eşleştirmesi yapılamadı. |
| Hizmet bölgesi | "İstanbul ve uzaktan yürütülebilen işler için Türkiye geneli". Şehir sayfası **üretilmedi** (doorway riski). |
| Fiyatlar | Tohum rakamlar **başlangıç tahminidir** ve `verified: false` gelir. Doğrulanana kadar ziyaretçiye rakam gösterilmez; uyarı rakamsız çalışır. |
| Dönüş süresi | Metinlerde "genellikle birkaç iş günü" yazıyor. Gerçek kapasitene göre güncelle. |
| İletişim | Hiçbir telefon/e-posta uydurulmadı. Ayarlardan girilene kadar footer "talep formu üzerinden yaz" der. |

## 2. Riskli / eksik gördüğüm noktalar

1. **Talep ↔ kapasite:** Tek kişi tüm kategorilere yetişemeyebilir. Düğün gibi kapasite dışı kategorileri panelden yayından kaldırabilirsin (Hizmet → Yayında işaretini kaldır).
2. **Fiyat rakamları:** Yanlış rakam güveni bozar. Her hizmet için kendi fiyatlarını gir ve "doğruladım" işaretle.
3. **Yasal metinler taslak:** Veri sorumlusu unvanı, saklama süresi, sağlayıcılar ve yurt dışı aktarım bilgileri boş bırakıldı. Bir avukata kontrol ettirmeden yayına alma. Panel bunu "Yapılması gerekenler" listesinde gösterir.
4. **Kurucu = platform:** Sitede kurucunun kendisi hizmet verdiği açıkça yazıyor. Bu dürüst ama pazar yeri algısını zayıflatabilir; Faz B'ye geçerken metinler güncellenmeli.
5. **İnce içerik riski:** 9 hizmet sayfasının her biri özgün yazıldı. Yeni hizmet eklerken aynı derinliği koru; sadece anahtar kelime değiştirilmiş kopya sayfa ekleme.
6. **SEO sonuç garantisi yok:** Arama hacimleri ölçülmedi. Yayından sonra Search Console verisiyle başlık/metin iyileştirmesi yapılmalı.

## 3. Teknoloji ve mimari

| Katman | Seçim | Neden |
|---|---|---|
| Çalışma ortamı | Node.js ≥ 22.13 | Tek süreç, düşük maliyet, her sunucuda çalışır. |
| Render | React 19 ile **sunucu tarafında** render | Arama motorları tam HTML alır. Ziyaretçi sayfalarında JS ~3 KB; yalnızca form sayfası React'i hydrate eder. |
| Veritabanı | SQLite (Node'un yerleşik `node:sqlite` sürücüsü), WAL modu | Tek sunucu için en sağlam ve bakım gerektirmeyen seçenek; ek servis yok, yedeği tek dosya. Tüm sorgular parametreli. |
| Derleme | esbuild | Sunucu ve istemci paketlerini 1 saniyenin altında üretir. |
| Bağımlılık | Yalnızca `react`, `react-dom` | Saldırı yüzeyi ve bakım yükü minimum. |

**Next.js neden kullanılmadı?** Brief Next.js'i öneriyordu; bu geliştirme ortamında npm kayıt erişimi kapalıydı, Next.js kurulamadı. Kurulamayan ve test edilemeyen kod teslim etmek yerine, **aynı ilkeleri (SSR, TypeScript, gerçek veritabanı, sunucu tarafı yetki)** karşılayan ve uçtan uca test edilmiş bir yapı kurdum. Bileşenler React olduğu için ileride Next.js'e taşımak görünüm katmanını büyük ölçüde korur; değişecek olan yönlendirme (`src/server.tsx`, `src/admin/routes.tsx`) kısmıdır.

**Ölçek sınırı:** SQLite tek sunucuda günde on binlerce talep/ziyareti rahat taşır. Birden fazla sunucuya veya Faz B'ye (hesaplar, mesajlaşma) geçerken PostgreSQL'e taşıma önerilir; veri erişimi `src/lib/db.ts` + `repo.ts` arkasında toplandı.

```
src/
  server.tsx            HTTP sunucusu, genel sayfalar, API, statik dosyalar
  admin/routes.tsx      Panel yönlendirmeleri + sunucu tarafı yetki/CSRF
  admin/views.tsx       Panel ekranları
  views/                Layout, sayfalar, talep formu (SSR + hydrate)
  client/               Tarayıcı betikleri (form, çerez/ölçüm, panel)
  lib/                  config, db, http, security, pricing, seo, markdown, mail, requests, repo
  data/seed.ts          Başlangıç içerikleri (hizmetler, sorular, fiyat kuralları, yasal taslaklar)
migrations/             SQL şema dosyaları (sıralı, bir kez uygulanır)
scripts/                build, smoke-test
public/                 CSS, fontlar (Inter, kendi sunucunda), favicon, OG görseli
```

## 4. Sayfa haritası ve akışlar

```
/                              Ana sayfa (hero'da hizmet seçerek forma geçiş)
/hizmetler                     Kategorilere göre hizmet dizini
/hizmetler/{slug}              Hizmet sayfası (kapsam, fiyatı belirleyenler, süreç, SSS, ilgili hizmetler)
/talep-olustur?hizmet={slug}   6 adımlı talep formu (parametre canonical'a girmez)
/nasil-calisir  /fiyat-rehberi  /sss
/{sayfa}                       Panelden düzenlenen sayfalar: hakkimizda, kvkk-aydinlatma-metni, gizlilik-politikasi, cerez-politikasi, kullanim-kosullari
/sitemap.xml  /robots.txt
/admin/…                       Panel (noindex + robots Disallow)
```

Hizmet URL'leri briefteki gibi düz `/hizmetler/{slug}` yapısında. **Kategori sayfası açmadım:** her kategoride 1–3 hizmet olduğu için ince sayfa olurdu. Bir kategoride 4+ özgün hizmet olduğunda `/hizmetler/kategori/{slug}` eklemek mantıklı.

**Müşteri akışı (Mod A):** Google → hizmet sayfası → "İş talebi oluştur" (hizmet önceden seçili, form 2. adımdan başlar) → detaylar → bütçe (+ rehber uyarısı) → zamanlama → iletişim + aydınlatma onayı → özet → gönder → talep numarası ve sonraki adımlar. Taslak sekme kapanana kadar korunur; geri tuşunda veya hata durumunda hiçbir alan kaybolmaz.

**Yönetici akışı:** Bildirim e-postası (kişisel veri içermez, sadece panel bağlantısı) → Talepler → durum değiştir / not ekle / "bugün dönüş yaptım" → işlem geçmişi otomatik tutulur.

## 5. Tasarım sistemi

- **Renk:** `--brand` (mor, ana yüzeyler), `--brand-2` (mavi, bağlantı/odak), `--sky` (açık mavi, seçili alan zemini), `--signal` (fosforlu sarı-yeşil, **yalnızca** birincil CTA, hero'daki seçili hizmet ve talep numarası). Signal üzerinde her zaman koyu metin kullanılır.
- **Tipografi:** Inter Display (Black/Bold) başlıklar, Inter (Regular/SemiBold) metin. 4 dosya, Latin + Türkçe karakterlere indirilmiş, kendi sunucundan (Google Fonts'a IP gönderilmez).
- **İmza öğesi:** Hero'daki cümle: *"Bir [ürün fotoğrafçılığı ▾] için talep oluşturuyorum."* — seçim doğrudan formu açar; JavaScript olmadan da çalışır.
- **Kaçınılanlar:** kart yığınları, cam efekti, gradient, her bölüme farklı animasyon. Hizmetler tipografik liste; numaralandırma yalnızca gerçek sıralar için (nasıl çalışır adımları).
- **Erişilebilirlik:** görünür odak halkası, "içeriğe geç" bağlantısı, form hatalarında `aria-invalid` + açıklama ve ilk hatalı alana odak, adım değişiminde başlığa odak, `prefers-reduced-motion`, 44 px+ dokunma alanları.

## 6. Kurulum (yerel)

```bash
npm install
cp .env.example .env              # APP_SECRET ve SITE_URL'yi doldur
npm run build
ADMIN_PASSWORD='en-az-12-karakter' npm run admin:create -- sen@ornek.com "Adın" admin
npm start                         # http://localhost:3000  — ilk açılışta şema ve başlangıç içeriği otomatik kurulur
npm test                          # 24 uçtan uca kontrol (geçici veritabanıyla)
```

Geliştirirken `npm run dev` dosya değişikliklerinde yeniden derler ve sunucuyu yeniden başlatır.

### Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `APP_SECRET` | Evet | 32+ karakter rastgele. Oturum/CSRF imzası ve IP özeti. Değişirse tüm oturumlar düşer. |
| `SITE_URL` | Evet | `https://alanadin.com` — canonical, sitemap, Open Graph, Origin kontrolü. |
| `DATABASE_PATH` | Hayır | Varsayılan `data/app.db`. Kalıcı diskte olmalı. |
| `TRUST_PROXY_HEADER` | Hayır | Cloudflare arkasında `cf-connecting-ip`. Hız sınırının doğru çalışması için gerekli. |
| `RESEND_API_KEY`, `MAIL_FROM` | Hayır | Yeni talep bildirimi. **Senden gerekiyor:** Resend hesabı + alan adı doğrulaması. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Hayır | Cloudflare Turnstile. Kapalıyken bal küpü, 4 sn süre kontrolü ve IP başına 10 talep/saat sınırı çalışır. |

### Veritabanı

- Şema `migrations/` altında; sunucu açılışında sırayla ve bir kez uygulanır (`_migrations` tablosu). Yeni değişiklik için `002_….sql` ekleyip `src/lib/db.ts` içindeki listeye ekle.
- Yedek: `sqlite3 data/app.db ".backup yedek.db"` (çalışırken güvenli). Günlük otomatik yedek kurulmalı.

## 7. Yayınlama

Bu uygulama sürekli çalışan bir Node süreci ve kalıcı disk ister; **Cloudflare Pages / Netlify gibi statik barındırmada çalışmaz.** Önerilen düzen:

1. **Sunucu:** Küçük bir VPS (ör. Hetzner, DigitalOcean) üzerinde Docker veya doğrudan Node; ya da kalıcı diski olan bir PaaS (Fly.io volume, Railway volume, Render disk).
   ```bash
   docker build -t platform .
   docker run -d --restart unless-stopped -p 3000:3000 -v platform-data:/app/data --env-file .env platform
   docker exec -it <konteyner> node dist/cli.js create-admin sen@ornek.com "Adın" admin
   ```
2. **Cloudflare (DNS + proxy):** Alan adını Cloudflare'de proxied (turuncu bulut) olarak sunucuya yönlendir, SSL "Full (strict)", `TRUST_PROXY_HEADER=cf-connecting-ip`. Turnstile anahtarlarını da aynı hesaptan al.
3. **Search Console:** Alan adı mülkünü ekle, doğrulama kodunu Panel → Ayarlar'a gir, `https://alanadin.com/sitemap.xml` gönder.
4. **GA4 (isteğe bağlı):** Ölçüm kimliğini Ayarlar'a gir. Yalnızca ziyaretçi onay verirse yüklenir; kimlik boşken çerez bandı hiç görünmez.

## 8. SEO kontrol listesi (uygulananlar)

- Sunucu tarafında tam HTML; her sayfada benzersiz `<title>`, meta açıklama, tek H1, mantıklı H2/H3.
- Canonical (sorgu parametresi içermez), `noindex` 404/hata/panel sayfalarında, `X-Robots-Tag` panelde.
- 301 ile tek biçim URL (küçük harf, sondaki `/` yok, çift `//` yok). Türkçe karakter içermeyen kalıcı slug'lar.
- XML sitemap (lastmod ile), robots.txt.
- Schema.org: Organization, WebSite, Service (fiyat yalnızca doğrulanmışsa), FAQPage, BreadcrumbList.
- Open Graph + Twitter kartı, varsayılan 1200×630 paylaşım görseli.
- İç bağlantı: hizmetler arası "ilgili hizmetler", gövde içi bağlantılar, footer kategori bağlantıları.
- Performans: Ziyaretçi sayfalarında tek CSS (~35 KB, sıkıştırılmış ~7 KB), ~3 KB JS, font preload, sürüm parmak izli uzun süreli önbellek. Form sayfasında React paketi ~210 KB (sıkıştırılmış ~65 KB).

**Ölçülmesi gerekenler** (ölçüm yapılmadan sonuç uydurulmadı): Yayından sonra PageSpeed Insights / Lighthouse ile mobil ölçüm al. Hedefler: LCP < 2,5 sn, CLS < 0,1, INP < 200 ms.

## 9. Güvenlik önlemleri

- Parolalar scrypt ile özetlenir. Oturum jetonu yalnızca HttpOnly + SameSite=Lax (+ HTTPS'te Secure) çerezde; veritabanında SHA-256 özeti tutulur. 7 gün geçerlilik.
- **Yetki sunucu tarafında:** her panel isteği `requireUser` + rol kontrolünden geçer. Editör talepleri, kişisel verileri, ayarları ve kullanıcıları göremez (403).
- **CSRF:** Tüm POST'larda Origin/Referer kontrolü + panel formlarında oturuma bağlı HMAC jeton.
- **XSS:** Tüm çıktı React ile kaçışlanır; panelde düzenlenen içerik HTML'e değil React öğelerine dönüşen güvenli bir markdown alt kümesiyle işlenir. Sıkı CSP, `frame-ancestors 'none'`.
- **SQL injection:** Yalnızca parametreli sorgular; LIKE aramalarında joker karakter kaçışı.
- **Spam / kötüye kullanım:** bal küpü alanı, minimum doldurma süresi, IP başına hız sınırı (talep 10/saat, giriş 8/15 dk), isteğe bağlı Turnstile, 64 KB istek gövdesi sınırı.
- CSV dışa aktarmada formül enjeksiyonu engellenir; dışa aktarma denetim kaydına yazılır.
- Denetim kaydı: giriş/çıkış, silme, ayar ve hizmet değişiklikleri (1 yıl saklanır).

## 10. KVKK, analitik ve gizlilik

- Formda yalnızca ad + seçilen iletişim kanalı zorunlu; firma isteğe bağlı. Aydınlatma metni onayı ve zamanı kaydedilir; pazarlama izni istenmez.
- **Anonim ölçüm** (kendi sunucunda): sayfa görüntüleme, form başlatma, adım, bütçe uyarısı, gönderim. Kişi/cihaz kimliği, çerez, IP veya yazılan metin **tutulmaz**; 400 günden eski kayıtlar otomatik silinir. Panelde huni ve kaynak raporları bu veriden gelir.
- Ham IP saklanmaz; hız sınırı için gizli anahtarla özetlenir ve 24 saat sonra silinir.
- Talep silme (kişinin başvurusu için) panelde kalıcı silme ile yapılır. Saklama süresini aşan kapanmış talepler panelde uyarı olarak görünür.
- **Hukuki not:** Yasal metinler taslaktır ve KVKK uyumu bu kodla garanti edilmiş değildir. Yayından önce bir hukuk uzmanı incelemeli; VERBİS kayıt yükümlülüğünüzün olup olmadığı da kontrol edilmeli.

## 11. Henüz uygulanmayanlar

| Özellik | Durum / neden |
|---|---|
| Dosya yükleme (talep formunda) | Yok. Güvenli depolama (ör. Cloudflare R2), virüs taraması ve saklama politikası gerekiyor. Şimdilik dönüşte bağlantı istenir. |
| Müşteri/freelancer hesapları, profiller, portföy | Faz B. Veri modeli genişletilecek. |
| Eşleştirme, teklif verme, mesajlaşma, iş takibi, yorumlar | Faz B–C. |
| Müşteriye otomatik "talebin alındı" e-postası | Yok; yalnızca yöneticiye bildirim var (kişisel veri göndermemek için). |
| Görsel yükleme ve otomatik optimizasyon (panelde) | Hizmet görseli şimdilik adres (URL) olarak giriliyor. |
| Blog / rehber içerikleri | Sayfa yönetimi var; ayrı blog listesi ve kategori yapısı yok. |
| Kategori yönetimi ekranı | Kategoriler tohum veriyle geliyor; panelden düzenleme yok. |
| İki adımlı doğrulama (admin) | Yok; güçlü parola + hız sınırı var. |
| Otomatik yedekleme | Sunucu tarafında cron ile kurulmalı. |

## 12. İnovasyon fikirleri

Brief'teki A–G fikirlerinin ilk ikisi (akıllı bütçe rehberi, hizmete göre kapsam soruları) MVP'de var. Ek öneriler:

| Fikir | Kullanıcıya değer | Müşteri kazanımı | Freelancer güveni | Teknik zorluk | Başlangıç maliyeti | Aşama |
|---|---|---|---|---|---|---|
| **1. Paylaşılabilir brief bağlantısı** — gönderilen talebin özetini müşteriye özel, süreli bir linkle göstermek; ekibine iletebilir. | Yüksek | Orta (şirket içi onay hızlanır) | Orta | Düşük | Düşük | Faz 3 |
| **2. Kapsam karşılaştırma kartı** — teklifte "bu fiyata dahil olanlar / olmayanlar / revizyon sayısı" standart şablonu. | Yüksek | Yüksek | Yüksek (kapsam kayması azalır) | Düşük | Düşük | Faz 3 |
| **3. Bütçe → kapsam önerisi** — bütçe düşükse "bu bütçeyle 25 yerine 10 ürün" gibi alternatif kapsam önermek. | Yüksek | Yüksek (terk azalır) | Orta | Orta | Düşük | Faz 3 |
| **4. Örnek beğeni panosu** — formda 6–8 stil örneğinden seçim yaptırmak (doğal, minimal, renkli…). Brief kalitesini artırır. | Orta | Orta | Yüksek | Orta | Orta (gerçek görsel gerekir) | Faz 3 |
| **5. Şeffaf takvim göstergesi** — "Bu ay için 2 çekim günü uygun" gibi gerçek kapasite bilgisi (yönetici girer). | Orta | Yüksek (acil işler için) | Orta | Düşük | Düşük | Faz 3 |
| **6. Tamamlanmış işten doğrulanmış yorum** — yalnızca panelde "Tamamlandı" olan taleplerin sahibine yorum bağlantısı gönderilir. | Yüksek | Yüksek | Yüksek | Orta | Düşük | Faz 4 |
| **7. Kilometre taşı ödemesi** — iş bölümlere ayrılır, her teslimde onay. | Yüksek | Orta | Çok yüksek | Yüksek (ödeme kuruluşu entegrasyonu, mevzuat) | Yüksek | Faz 4+ |

## 13. Gelir modeli analizi (henüz devrede değil)

| Model | Artı | Risk | Öneri |
|---|---|---|---|
| Tamamlanan işten komisyon | Platform yalnızca değer ürettiğinde kazanır; freelancer'ı korur. | Taraflar platform dışında anlaşabilir (bypass). Ödeme altyapısı gerekir. | Faz 4'te, emanet/kilometre taşı ödemesiyle birlikte. |
| Freelancer profesyonel üyelik | Öngörülebilir gelir. | **Müşteri yokken satılırsa güveni yakar.** | Yalnızca kanıtlanmış talep hacmi olduktan sonra ve "garanti iş" vaadi olmadan. |
| Ücretli öne çıkarma | Kolay uygulanır. | Eşleşme kalitesini bozar, yanıltıcı olabilir. | Yapılırsa "sponsorlu" etiketiyle organik önerilerden ayrı. |
| İşletme aboneliği | Düzenli içerik ihtiyacı olan markalar için doğal (aylık sosyal medya, Reels). | Operasyon yükü. | Faz A'da bile kurucunun kendi aylık paketleriyle test edilebilir. |

## 14. Yol haritası

- **Hemen (yayın öncesi):** marka adı/logo, iletişim bilgileri, fiyatları doğrula, yasal metinleri avukata kontrol ettir, Resend + Turnstile anahtarları, SITE_URL, yedekleme.
- **Faz 3:** otomatik müşteri onay e-postası, dosya yükleme (R2), kapsam karşılaştırma kartı, bütçe→kapsam önerisi, hizmet görselleri.
- **Faz 4:** freelancer başvuru ve doğrulama, profiller, eşleştirme gerekçesi gösterimi, teklifler, doğrulanmış yorumlar; PostgreSQL'e geçiş.
