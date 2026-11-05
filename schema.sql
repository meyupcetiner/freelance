-- Brif Worker veritabanı (Cloudflare D1: brif-db). Tablolar zaten oluşturuldu; bu dosya yeniden kurulum içindir:
-- npx wrangler d1 execute brif-db --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS talepler (
  id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE, idem TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  kategori TEXT NOT NULL, kategori_ad TEXT NOT NULL, hizmet TEXT NOT NULL, hizmet_ad TEXT NOT NULL,
  cevaplar TEXT NOT NULL DEFAULT '{}', aciklama TEXT NOT NULL DEFAULT '',
  butce_tur TEXT NOT NULL, butce INTEGER, rehber_min INTEGER, butce_dusuk INTEGER NOT NULL DEFAULT 0,
  zaman TEXT NOT NULL, zaman_tarih TEXT, ad TEXT NOT NULL, telefon TEXT NOT NULL, eposta TEXT NOT NULL, tercih TEXT NOT NULL,
  firma TEXT NOT NULL DEFAULT '', kvkk_at TEXT NOT NULL, iletisim_izni INTEGER NOT NULL DEFAULT 0,
  durum TEXT NOT NULL DEFAULT 'yeni', son_iletisim TEXT, kaynak TEXT NOT NULL DEFAULT '{}'
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
