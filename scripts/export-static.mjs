// Statik site çıktısı (Cloudflare Pages için): node scripts/export-static.mjs https://alanadin.com
// Sunucuyu geçici bir veritabanıyla statik modda başlatır, tüm sayfaları HTML olarak site/ klasörüne yazar.
import { spawn, execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as esbuild from "esbuild";

const SITE = (process.argv[2] || "https://ornek.com").replace(/\/+$/, "");
const OUT = "site";
const tmp = mkdtempSync(join(tmpdir(), "export-"));
const port = 3990;
const B = `http://localhost:${port}`;
const env = { ...process.env, PORT: String(port), DATABASE_PATH: join(tmp, "e.db"), APP_SECRET: "static-export-" + Date.now() + "-xxxxxxxxxxxxxxxx", SITE_URL: SITE, STATIC_EXPORT: "1" };
const N = ["--disable-warning=ExperimentalWarning"];

execFileSync("node", ["scripts/build.mjs"], { stdio: "inherit" });
execFileSync("node", [...N, "dist/cli.js", "seed"], { env, stdio: "ignore" });

// Statik sürümde sunucu yok: yasal taslaklardaki sunucuya özgü cümleleri düzelt
const db = new DatabaseSync(env.DATABASE_PATH);
const patch = (slug, from, to) => {
  const r = db.prepare("SELECT body FROM pages WHERE slug = ?").get(slug);
  if (r) db.prepare("UPDATE pages SET body = ? WHERE slug = ?").run(r.body.replace(from, to), slug);
};
patch("cerez-politikasi", /- \*\*sid:\*\*.*\n/, "- **brif_admin:** Yalnızca yönetim paneline giriş yapan yetkili için oturum çerezi. Ziyaretçilere yerleştirilmez.\n");
patch("gizlilik-politikasi", /Sitenin hangi sayfalarının[\s\S]*?bulunmaz\.\n\n/, "");
patch("kvkk-aydinlatma-metni", "- **Talep bilgileri:** Seçtiğin hizmet, işin detayları, bütçe ve zamanlama tercihi", "- **Talep bilgileri:** Seçtiğin kategori ve hizmet, işin detayları, bütçe ve zamanlama tercihi, isteğe bağlı olarak eklediğin referans dosyaları\n- **İletişim izni:** Kampanya ve bilgilendirme iletileri için verdiğin isteğe bağlı izin (verdiysen)");
patch("kvkk-aydinlatma-metni", "Pazarlama iletisi gönderilmez; gönderilecekse ayrıca açık rıza alınır.", "Kampanya ve bilgilendirme iletileri yalnızca formda bu seçeneği ayrıca işaretlediysen gönderilir; bu izni istediğin zaman geri alabilirsin.");
patch("kvkk-aydinlatma-metni", "[Sağlayıcıların adı ve bulunduğu ülke — yurt dışı aktarım varsa KVKK m.9 kapsamındaki dayanak — buraya eklenmelidir.]", "Talep kayıtları ve eklenen dosyalar, barındırma ve veritabanı hizmeti alınan Cloudflare, Inc. (ABD) altyapısında saklanır. [Yurt dışına aktarımın KVKK m.9 kapsamındaki dayanağı hukuk danışmanıyla netleştirilip buraya eklenmelidir.]");
// Fiyat rehberi: statik sitede rakamlar gösterilir; kaynağı fiyatlar.js (yeniden derlemeden düzenlenebilir)
for (const r of db.prepare("SELECT id, pricing FROM services").all()) {
  const p = JSON.parse(r.pricing);
  p.verified = true;
  db.prepare("UPDATE services SET pricing = ? WHERE id = ?").run(JSON.stringify(p), r.id);
}
const fiyatRows = db.prepare("SELECT slug, name, pricing FROM services WHERE published = 1 ORDER BY sort").all();
db.close();

// Görsel düzenleyici: sayfalara düzenlenebilir öge kimlikleri eklenir (src/lib/tasarim.ts → annotate)
const annFile = join(tmp, "tasarim.mjs");
await esbuild.build({ entryPoints: ["src/lib/tasarim.ts"], bundle: true, format: "esm", platform: "neutral", outfile: annFile, logLevel: "warning" });
const { annotate } = await import(annFile);

const srv = spawn("node", [...N, "dist/server.js"], { env, stdio: ["ignore", "ignore", "inherit"] });
try {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + "/robots.txt"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const sitemap = await (await fetch(B + "/sitemap.xml")).text();
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, "") || "/");
  paths.push("/blog-sablon"); // Worker'ın blog sayfalarını doldurduğu kabuk (site haritasında yok)
  for (const p of paths) {
    const html = await (await fetch(B + p)).text();
    // Cloudflare Pages: /hizmetler → hizmetler.html (sonda / olmadan, canonical ile aynı)
    const file = p === "/" ? "index.html" : p.slice(1) + ".html";
    mkdirSync(dirname(join(OUT, file)), { recursive: true });
    writeFileSync(join(OUT, file), annotate(html));
    console.log("✓", p);
  }
  writeFileSync(join(OUT, "404.html"), await (await fetch(B + "/bulunamadi-404")).text());
  writeFileSync(join(OUT, "sitemap.xml"), sitemap);
  // Arama motorları ve yapay zekâ tarayıcıları açıkça izinli (AI aramalarında görünmek için)
  const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot", "CCBot", "meta-externalagent", "Amazonbot", "DuckAssistBot", "YandexBot"];
  const block = "Allow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /blog-sablon\n";
  writeFileSync(join(OUT, "robots.txt"), `User-agent: *\n${block}\n${AI_BOTS.map((b) => `User-agent: ${b}\n${block}`).join("\n")}\nSitemap: ${SITE}/sitemap.xml\n`);
  writeFileSync(join(OUT, "llms.txt"), `# Brif

> Brif, İstanbul merkezli fotoğraf/video prodüksiyonu, grafik tasarım ve dijital pazarlama (web sitesi, Meta ve Google reklam yönetimi, sosyal medya yönetimi) hizmetleri için talep platformudur. Müşteri ihtiyacını kısa bir formla anlatır, kapsamına ve bütçesine uygun yazılı teklif alır.

## Alanlar
- [Brif Stüdyo — Fotoğraf ve video](${SITE}/): ürün, katalog ve reklam fotoğrafı, tanıtım filmi, Reels, etkinlik çekimi, video kurgu
- [Brif Tasarım — Grafik ve içerik](${SITE}/tasarim): logo, kurumsal kimlik, katalog, ambalaj, sosyal medya tasarımı, metin ve içerik yazımı
- [Brif Dijital — Web, reklam ve sosyal medya](${SITE}/dijital): kurumsal web sitesi, e-ticaret, Meta ve Google reklam yönetimi, sosyal medya yönetimi

## Hizmet sayfaları
- [Ürün fotoğrafçısı](${SITE}/hizmetler/urun-fotografcisi)
- [Tanıtım videosu çekimi](${SITE}/hizmetler/tanitim-videosu-cekimi)
- [Reels video çekimi](${SITE}/hizmetler/reels-video-cekimi)
- [Etkinlik fotoğrafçısı](${SITE}/hizmetler/etkinlik-fotografcisi)
- [Düğün fotoğrafçısı](${SITE}/hizmetler/dugun-fotografcisi)
- [Video editörü](${SITE}/hizmetler/video-editoru)
- [Grafik tasarım](${SITE}/hizmetler/grafik-tasarim)
- [Sosyal medya yönetimi](${SITE}/hizmetler/sosyal-medya-yonetimi)
- [Meta reklam yönetimi](${SITE}/hizmetler/meta-reklam-yonetimi)
- [Tüm hizmetler](${SITE}/hizmetler)

## Bilgi
- [Fiyat rehberi](${SITE}/fiyat-rehberi): hizmetlere göre başlangıç fiyat aralıkları (TL)
- [Nasıl çalışır?](${SITE}/nasil-calisir)
- [Sık sorulan sorular](${SITE}/sss)
- [Blog](${SITE}/blog): fiyat ve süreç rehberleri
- [Talep oluştur](${SITE}/talep-olustur)
`);
  writeFileSync(join(OUT, ".assetsignore"), "worker.js\nschema.sql\n.assetsignore\n"); // Worker kodu ve şema statik dosya olarak yayınlanmasın
} finally {
  srv.kill();
  rmSync(tmp, { recursive: true, force: true });
}

for (const f of ["styles.css", "favicon.svg", "favicon.ico", "favicon-48.png", "favicon-192.png", "og-default.png", "fonts", "assets/site.js", "assets/talep.js", "assets/home.js", "assets/editor.js", "assets/editor.css", "assets/fonts", "assets/ill", "assets/kategori", "assets/logo-yazi.png", "assets/freelancer-masa.webp", "assets/freelancer-masa-cizgi.webp", "logo.svg", "apple-touch-icon.png", "5880f9bc5bf5099b5f0e4be3cb50cf17.txt"]) cpSync(join("public", f), join(OUT, f), { recursive: true });
if (!existsSync("ayarlar.js")) {
  writeFileSync("ayarlar.js", `// Sitenin düzenlenebilir ayarları. Değiştirdikten sonra yeniden derlemeye gerek yok; bu dosyayı site/ klasörüne kopyalaman yeterli.
window.SITE_AYAR = {
  // Talep formunun gönderileceği WhatsApp numarası (ör. "0532 123 45 67"). Boşsa WhatsApp butonu görünmez.
  whatsapp: "",
  // Taleplerin gönderileceği e-posta adresi. Boşsa e-posta butonu görünmez.
  email: "",
  // Google Analytics 4 ölçüm kimliği (ör. "G-ABC123"). Yalnızca ziyaretçi çerez onayı verirse yüklenir.
  ga: "",
  // Logo dosyası (ör. "/logo.svg"). Boşsa yazı logosu kullanılır.
  logo: "",
};
`);
}
cpSync("ayarlar.js", join(OUT, "ayarlar.js"));

// fiyatlar.js — her hizmetin fiyat kuralı
const J = (v) => JSON.stringify(v);
let fj = `// Brif fiyat rehberi. Bu dosyadaki rakamlar bütçe hesaplayıcısında, talep formunda,
// hizmet sayfalarında ve fiyat rehberi sayfasında kullanılır. Yeniden derleme gerekmez.
//
// base     : taban tutar (₺)
// perUnit  : birim başına tutar (₺) — birim, unitLabel'da yazan şeydir (ürün, saat, video...)
// addons   : seçilirse alt sınıra eklenen tutarlar
// tiers    : kapsam seviyeleri; from/to aralığı (₺), to: null = üst sınır yok
// Rakamlar kesin teklif değildir, sitede "rehber" olarak gösterilir.
window.FIYAT_REHBERI = {\n`;
for (const r of fiyatRows) {
  const p = JSON.parse(r.pricing);
  fj += `  // ${r.name}\n  ${J(r.slug)}: {\n    base: ${p.base}, perUnit: ${p.perUnit}, unitLabel: ${J(p.unitLabel)},\n    addons: [\n${p.addons.map((a) => `      ${J(a)},`).join("\n")}\n    ],\n    tiers: [\n${p.tiers.map((t) => `      ${J(t)},`).join("\n")}\n    ],\n  },\n`;
}
fj += "};\n";
if (!existsSync("fiyatlar.js")) writeFileSync("fiyatlar.js", fj);
cpSync("fiyatlar.js", join(OUT, "fiyatlar.js"));


writeFileSync(join(OUT, "_headers"), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
// Cloudflare Worker (talep API + yönetim paneli) — tek dosya, bağımlılıksız
const pricingMap = {};
for (const r of fiyatRows) {
  const p = JSON.parse(r.pricing);
  if (p.enabled) pricingMap[r.slug] = p;
}
await esbuild.build({
  entryPoints: ["src/worker/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: true,
  outfile: join(OUT, "worker.js"),
  define: { __PRICING__: JSON.stringify(pricingMap), __BUILD__: JSON.stringify(Date.now().toString(36)) },
  logLevel: "warning",
});
cpSync("migrations/worker-001.sql", join(OUT, "schema.sql"));
console.log(`\nHazır: ${OUT}/  (SITE_URL=${SITE})`);
