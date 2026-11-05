-- Brif Worker veritabanı (Cloudflare D1: brif-db). Tablolar zaten oluşturuldu; bu dosya yeniden kurulum içindir:
-- npx wrangler d1 execute brif-db --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS talepler (
  id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE, idem TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  kategori TEXT NOT NULL, kategori_ad TEXT NOT NULL, hizmet TEXT NOT NULL, hizmet_ad TEXT NOT NULL,
  cevaplar TEXT NOT NULL DEFAULT '{}', aciklama TEXT NOT NULL DEFAULT '',
  butce_tur TEXT NOT NULL, butce INTEGER, rehber_min INTEGER, butce_dusuk INTEGER NOT NULL DEFAULT 0,
  zaman TEXT NOT NULL, zaman_tarih TEXT, ad TEXT NOT NULL, telefon TEXT NOT NULL, eposta TEXT NOT NULL, tercih TEXT NOT NULL,
  firma TEXT NOT NULL DEFAULT '', kvkk_at TEXT NOT NULL, iletisim_izni INTEGER NOT NULL DEFAULT 0,
  durum TEXT NOT NULL DEFAULT 'yeni', son_iletisim TEXT, kaynak TEXT NOT NULL DEFAULT '{}', profil_id INTEGER
);
CREATE INDEX IF NOT EXISTS talepler_tarih ON talepler(created_at);
CREATE INDEX IF NOT EXISTS talepler_durum ON talepler(durum);
CREATE INDEX IF NOT EXISTS talepler_kategori ON talepler(kategori);
CREATE TABLE IF NOT EXISTS notlar (id INTEGER PRIMARY KEY, talep_id INTEGER NOT NULL REFERENCES talepler(id) ON DELETE CASCADE, metin TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notlar_talep ON notlar(talep_id);
CREATE TABLE IF NOT EXISTS dosyalar (id INTEGER PRIMARY KEY, talep_id INTEGER NOT NULL REFERENCES talepler(id) ON DELETE CASCADE, ad TEXT NOT NULL, tur TEXT NOT NULL, boyut INTEGER NOT NULL, veri BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS dosyalar_talep ON dosyalar(talep_id);
CREATE TABLE IF NOT EXISTS istek_sinir (k TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS istek_sinir_k ON istek_sinir(k, ts);
CREATE TABLE IF NOT EXISTS isler (
  id INTEGER PRIMARY KEY, baslik TEXT NOT NULL, kategori TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
  sira INTEGER NOT NULL DEFAULT 0, yayinda INTEGER NOT NULL DEFAULT 1, tur TEXT NOT NULL, boyut INTEGER NOT NULL, gorsel BLOB NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS isler_sira ON isler(yayinda, sira, id);
CREATE TABLE IF NOT EXISTS profiller (
  id INTEGER PRIMARY KEY, ad TEXT NOT NULL, unvan TEXT NOT NULL DEFAULT '', aciklama TEXT NOT NULL DEFAULT '', alanlar TEXT NOT NULL DEFAULT '',
  gorsel TEXT NOT NULL DEFAULT '', sira INTEGER NOT NULL DEFAULT 0, yayinda INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO profiller (id, ad, unvan, aciklama, alanlar, gorsel, sira, yayinda, updated_at) VALUES
(1, 'Brif Stüdyo', 'Fotoğraf ve video prodüksiyonu', 'Ürün, e-ticaret, etkinlik ve portre çekimleri; tanıtım filmi, Reels ve kurgu. Çekim planı, ışık ve teslim formatları baştan netleşir.', 'fotograf-video', 'working-on-computer', 1, 1, '2026-11-06T00:00:00Z'),
(2, 'Brif Tasarım', 'Grafik tasarım, sosyal medya ve içerik', 'Logo ve kurumsal kimlikten sosyal medya tasarımına, içerik planından metin yazımına kadar markanın görünen yüzü.', 'grafik-tasarim,sosyal-medya,metin-icerik', 'brainstorming-ideas', 2, 1, '2026-11-06T00:00:00Z'),
(3, 'Brif Dijital', 'Web ve performans pazarlaması', 'Web sitesi, landing page ve SEO; Meta ve Google reklamları, e-ticaret optimizasyonu. Ölçüm kurulumu işin bir parçası.', 'web-yazilim,reklam-eticaret', 'reviewing-documents', 3, 1, '2026-11-06T00:00:00Z');
-- Var olan kurulumda: ALTER TABLE talepler ADD COLUMN profil_id INTEGER;
-- Görsel düzenleyici
CREATE TABLE IF NOT EXISTS tasarimlar (yol TEXT PRIMARY KEY, taslak TEXT, taslak_at TEXT, yayin TEXT, yayin_at TEXT);
CREATE TABLE IF NOT EXISTS medya (id INTEGER PRIMARY KEY, ad TEXT NOT NULL, tur TEXT NOT NULL, boyut INTEGER NOT NULL, alt TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL UNIQUE, veri BLOB NOT NULL, created_at TEXT NOT NULL);
