-- 001_init: temel şema
-- Kurallar: tarihler ISO-8601 (UTC) metin; JSON alanlar TEXT; kişisel veri yalnızca requests tablosunda.

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE services (
  id               INTEGER PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  category_id      INTEGER NOT NULL REFERENCES categories(id),
  name             TEXT NOT NULL,          -- formda ve listelerde görünen ad
  h1               TEXT NOT NULL,
  seo_title        TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  summary          TEXT NOT NULL DEFAULT '', -- listelerde kısa açıklama
  body             TEXT NOT NULL DEFAULT '', -- güvenli markdown alt kümesi
  faq              TEXT NOT NULL DEFAULT '[]',
  questions        TEXT NOT NULL DEFAULT '[]', -- forma özel dinamik sorular
  pricing          TEXT NOT NULL DEFAULT '{}', -- fiyat rehberi kuralları
  related          TEXT NOT NULL DEFAULT '[]', -- ilgili hizmet slug'ları
  image_url        TEXT NOT NULL DEFAULT '',
  image_alt        TEXT NOT NULL DEFAULT '',
  published        INTEGER NOT NULL DEFAULT 0,
  sort             INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX services_published ON services(published, sort);

CREATE TABLE pages (
  id               INTEGER PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  seo_title        TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  body             TEXT NOT NULL DEFAULT '',
  is_legal         INTEGER NOT NULL DEFAULT 0,
  reviewed         INTEGER NOT NULL DEFAULT 0, -- hukuki inceleme yapıldı mı
  published        INTEGER NOT NULL DEFAULT 1,
  updated_at       TEXT NOT NULL
);

CREATE TABLE statuses (
  id        INTEGER PRIMARY KEY,
  key       TEXT NOT NULL UNIQUE,
  label     TEXT NOT NULL,
  tone      TEXT NOT NULL DEFAULT 'neutral', -- neutral|info|warn|ok|muted
  is_open   INTEGER NOT NULL DEFAULT 1,      -- 0 = kapanmış (tamamlandı/iptal)
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE requests (
  id              INTEGER PRIMARY KEY,
  ref             TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  service_id      INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_name    TEXT NOT NULL,     -- kayıt anındaki ad (hizmet silinse de kalır)
  category_slug   TEXT NOT NULL,
  answers         TEXT NOT NULL DEFAULT '{}',
  description     TEXT NOT NULL DEFAULT '',
  budget_amount   INTEGER,           -- TL, null = belirtilmedi
  budget_mode     TEXT NOT NULL,     -- amount|quote
  estimate_min    INTEGER,           -- gönderim anındaki rehber alt sınır
  budget_warned   INTEGER NOT NULL DEFAULT 0,
  timing          TEXT NOT NULL,
  timing_date     TEXT,
  contact_name    TEXT NOT NULL,
  contact_email   TEXT,
  contact_phone   TEXT,
  contact_pref    TEXT NOT NULL,     -- email|phone|whatsapp
  company         TEXT NOT NULL DEFAULT '',
  privacy_ack_at  TEXT NOT NULL,     -- aydınlatma metninin gösterildiği/onaylandığı an
  status_id       INTEGER NOT NULL REFERENCES statuses(id),
  last_contact_at TEXT,
  src_source      TEXT NOT NULL DEFAULT '',
  src_medium      TEXT NOT NULL DEFAULT '',
  src_campaign    TEXT NOT NULL DEFAULT '',
  src_referrer    TEXT NOT NULL DEFAULT '',  -- yalnızca alan adı
  src_landing     TEXT NOT NULL DEFAULT ''   -- yalnızca yol (query yok)
);
CREATE INDEX requests_created ON requests(created_at);
CREATE INDEX requests_status ON requests(status_id);
CREATE INDEX requests_category ON requests(category_slug);

CREATE TABLE request_activity (
  id          INTEGER PRIMARY KEY,
  request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL, -- created|status|note|contact|edit
  body        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX request_activity_req ON request_activity(request_id, created_at);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','editor')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id_hash     TEXT PRIMARY KEY,  -- tokenın SHA-256 özeti; ham token yalnızca çerezde
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Anonim, toplulaştırılmış ürün analitiği: kişi/cihaz kimliği, IP veya serbest metin YOK.
CREATE TABLE events (
  id        INTEGER PRIMARY KEY,
  day       TEXT NOT NULL,   -- YYYY-MM-DD
  name      TEXT NOT NULL,   -- page_view|form_start|form_step|form_submit|budget_warning
  path      TEXT NOT NULL DEFAULT '',
  service   TEXT NOT NULL DEFAULT '',
  step      INTEGER,
  source    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX events_day_name ON events(day, name);

-- Kayan pencere hız sınırı. key = HMAC(ip) + eylem; ham IP saklanmaz.
CREATE TABLE rate_limits (
  key        TEXT NOT NULL,
  ts         INTEGER NOT NULL
);
CREATE INDEX rate_limits_key ON rate_limits(key, ts);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
