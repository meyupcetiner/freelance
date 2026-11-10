# Brif — proje rehberi

Brif, SEO'dan müşteri getiren bir hizmet talep platformu (fotoğraf/video, tasarım, web/reklam/sosyal medya).
Canlı: https://getbrif.com — Cloudflare Workers + D1.

## Sahibi ve çalışma tarzı
- Sahibi Eyüp (fotoğrafçı/girişimci). **Türkçe konuş, kısa cevap ver (2–3 satır).** Uzun açıklama istemedikçe yazma.
- Büyük/görsel değişikliklerde önce ne yapacağını söyle, onay al. Küçük düzeltmeleri direkt yap.
- Backend'i, DB'yi, formları, SEO'yu ve admin panelini bozma.

## Ürün kuralları (Eyüp'ün kararları)
- **Faz 1:** Tüm talepler Eyüp'e gelir. Otomatik atama YOK — talep `profil_id = NULL` kaydedilir, Eyüp admin'de talebe uygun profili seçip o profil olarak cevap verir.
- **Faz 2 (ileride):** Gerçek freelancer kaydı + eşleştirmeli pazar yeri.
- Hedef: bütçesi olan müşteri ("parası olan müşteri"), kalitesiz müşteri değil.
- **Ekip sitede gösterilmez.** Profiller (`src/data/profiles.ts`, 7 gerçek kişi, soyadı baş harf) sadece admin'de.
- Sahte iş, sahte yorum, sahte portfolyo, sahte istatistik YOK.
- Marka sesi: profesyonel ve kreatif ("kreatif insanların sitesi"). "Kurucu her talebi okuyor", "yeni platform" gibi ifadeler kullanılmaz. Motto: "Fikrini anlat, gerisini yaratıcılara bırak."
- Siteyi uzun metinle boğma; uzun metin sadece SEO'ya hizmet ediyorsa (hizmet sayfaları, blog).
- Başlıklar gereksiz yere alt satıra taşmasın (masaüstünde hub başlıkları tek satır).
- Logo: `public/assets/logo-yazi.png` (PNG) + SVG işaret. Logoyu yazıyla yeniden yapma.
- Fontlar: başlık **Instrument Sans**, metin **Geist** (`public/assets/fonts/`, WOFF, Türkçe karakterli). Affinity'ye benzeyen font/tasarım kullanma (Bricolage, Schibsted reddedildi).
- Header'daki Stüdyo/Tasarım/Dijital sekmeleri Lucide tarzı ince çizgi ikonlu.
- Sosyal medya **Dijital** kategorisinde. WhatsApp numarası sitede yok.

## Site yapısı
- Üç "hub" (`src/data/hubs.ts`): `/` Brif Stüdyo (foto/video), `/tasarim` Brif Tasarım (grafik+içerik), `/dijital` Brif Dijital (web, reklam, sosyal). Hub sayfaları portfolyo sayfası: başlık + "Talep oluştur" + iş ızgarası (`<!--ISLER:key-->` işaretini worker `isler` tablosundan doldurur).
- `/ana-sayfa` eski ana sayfa, `/hizmetler` kategori kutuları, `/talep-olustur` çok adımlı form, `/blog` (worker D1'den render eder), `/fiyat-rehberi`, yasal sayfalar.
- Admin: `/admin` (şifre: Cloudflare secret `ADMIN_PASSWORD`). Talepler, notlar, profiller, örnek işler (portfolyo), blog, medya, görsel düzenleyici (`/admin/duzenleyici`).
- `ayarlar.js` ve `fiyatlar.js` kökte; Eyüp elle düzenleyebilir, export bunları `site/`'a kopyalar.

## Kod düzeni
- `src/` — React 19 SSR (`server.tsx`, `views/`), veri (`data/`), istemci JS (`client/`), görsel düzenleyici (`lib/tasarim.ts`), **Cloudflare Worker** (`worker/index.ts`).
- `scripts/build.mjs` — esbuild ile derler (`dist/`, `public/assets/*.js`).
- `scripts/export-static.mjs` — sunucuyu geçici DB ile açıp tüm sayfaları `site/` klasörüne HTML olarak yazar; worker'ı `site/worker.js` olarak paketler, şemayı `site/schema.sql`'e kopyalar.
- `site/` — **yayınlanan çıktı, commit'lenir.** Elle düzenleme; kaynağı değiştirip yeniden üret.
- `migrations/` — D1 SQL. D1 veritabanı: `brif-db` (id `8219d601-bde3-4418-92b8-2c9c226ff0c0`). Tablolar: talepler, notlar, dosyalar, istek_sinir, isler, profiller, tasarimlar, medya, bloglar, kurulum.
- `scripts/blog-posts.json` — ilk 5 blog yazısı; worker ilk istekte bir kez D1'e tohumlar.
- `wrangler.jsonc` — Worker ayarı (`main: site/worker.js`, assets `./site`).

## Komutlar
```bash
npm install                # Node 22.13+
npm run site               # derle + site/ klasörünü üret (her değişiklikten sonra)
ADMIN_PASSWORD=test123 npm run yerel   # yerel Worker + D1 taklidi → http://localhost:3000
npm run typecheck
```
Test araçları (`tools/`, Playwright gerekir: `npm i -D playwright && npx playwright install chromium`):
- `node tools/shot.mjs <çıktı-klasörü> "/yol|1440|ad|0"` — ekran görüntüsü (yerel sunucu açıkken; son alan 1 = tam sayfa)
- `ADMIN_PASSWORD=test123 node tools/e2e-45.mjs <çıktı-klasörü> . data/test.db` — 45 hizmetin formunu uçtan uca test eder ("mobil mega menü açılmadı" hatası beklenen: Hizmetler artık link).

## Yayına alma
`main` dalına push → Cloudflare Workers Builds otomatik deploy eder.
1. Kaynağı değiştir → `npm run site`
2. Yerelde kontrol et (gerekirse ekran görüntüsü)
3. `git add -A && git commit && git push`
4. Kontrol: Cloudflare → Workers & Pages → getbrifcom → Builds. GitHub'daki check-run, deploy başarılı olsa bile "failure" gösterebiliyor; asıl sonuç Cloudflare build log'unda.

## Yapılacaklar (Eyüp'e hatırlatılacak)
- Search Console + Bing Webmaster'a siteyi ekle, sitemap gönder; Google İşletme Profili.
- Haftalık blog yazısı. Fiyat rehberindeki düşük alt sınırları yükselt.
- Admin → Örnek işler'den portfolyo görselleri; ana sayfadaki G01–G04, G11–G16 yer tutucularına görsel.
