// 6 kategori + 45 alt hizmetin tamamını tarayıcıda uçtan uca test eder; ardından admin panelini doğrular.
import { chromium } from "playwright";
import * as esbuild from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";

const [, , S, PLATFORM, DBPATH] = process.argv;
const B = "http://localhost:3000";
const r = await esbuild.build({ entryPoints: [PLATFORM + "/src/data/catalog.ts"], bundle: true, format: "esm", write: false, platform: "node" });
const cat = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

// küçük PNG (1x1) — dosya yükleme testi için
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000301010018dd8db00000000049454e44ae426082", "hex");
writeFileSync(S + "/ref.png", png);
writeFileSync(S + "/bad.txt", "merhaba");

const b = await chromium.launch({ args: ["--no-sandbox"] });
const errs = [];
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

async function newPage(w = 1280) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
  await p.clock.install();
  return p;
}

let i = 0;
const refs = {};
for (const svc of cat.SERVICES) {
  i++;
  const p = await newPage(i % 3 === 0 ? 390 : 1280);
  await p.goto(`${B}/talep-olustur?hizmet=${svc.slug}`);
  await p.waitForSelector(".fs h2");
  ok((await p.textContent(".fs h2")) === "Proje detayları", `${svc.slug}: detay adımı açılmadı`);
  ok((await p.textContent(".picked")).includes(svc.name), `${svc.slug}: seçili hizmet görünmüyor`);
  // sorular katalogla birebir mi?
  for (const q of svc.questions) ok((await p.locator(`text=${q.label}`).count()) > 0, `${svc.slug}: "${q.label}" sorusu yok`);
  // önce boş "Devam" → zorunlu alan hatası beklenir (zorunlu soru varsa)
  const req = svc.questions.filter((q) => q.required);
  await p.click("button:has-text('Devam')");
  if (req.length) ok((await p.locator(".field-err").count()) >= req.length, `${svc.slug}: zorunlu alan hatası eksik`);
  for (const q of svc.questions) {
    if (!q.required && i % 2) continue; // tek sıralarda yalnızca zorunluları doldur
    if (q.type === "number") await p.fill(`#q-${q.key}`, String(Math.min(q.max ?? 10, 12)));
    else if (q.type === "text") await p.fill(`#q-${q.key}`, "Test cevabı " + q.key);
    else await p.locator(`input[name="q-${q.key}"]`).first().locator("xpath=..").click();
  }
  await p.fill("#f-desc", `Otomatik test: ${svc.name}`);
  await p.click("button:has-text('Devam')");
  ok((await p.textContent(".fs h2")) === "Bütçe ve zaman", `${svc.slug}: bütçe adımına geçemedi (${await p.textContent(".fs h2")})`);
  if (i % 4 === 0) await p.click("label:has-text('Teklif almak istiyorum')");
  else await p.fill("#f-budget", String(1000 + i * 700));
  await p.locator('input[name="timing"]').nth(i % 5).locator("xpath=..").click();
  if (i % 5 === 3) await p.fill("#f-date", "2027-01-15");
  if (i % 7 === 1) {
    await p.setInputFiles('input[type="file"]', S + "/ref.png");
    await p.waitForSelector(".file-list li");
  }
  await p.click("button:has-text('Devam')");
  ok((await p.textContent(".fs h2")) === "İletişim bilgilerin", `${svc.slug}: iletişim adımına geçemedi`);
  await p.fill("#f-name", "Test Kişi " + i);
  await p.fill("#f-phone", "0532 111 22 " + String(10 + (i % 89)).padStart(2, "0"));
  await p.fill("#f-email", `test${i}@ornek.com`);
  await p.check("#f-kvkk");
  if (i % 2) await p.check("#f-consent");
  await p.click("button:has-text('Devam')");
  const sum = await p.textContent(".summary");
  ok(sum.includes(svc.name) && sum.includes(cat.CATEGORIES.find((c) => c.slug === svc.category).name), `${svc.slug}: özet eksik`);
  await p.clock.fastForward(6000);
  await p.click("button:has-text('Talebi gönder')");
  try {
    await p.waitForSelector(".req-done", { timeout: 8000 });
    refs[svc.slug] = (await p.textContent(".ref")).trim();
  } catch {
    fails.push(`${svc.slug}: gönderilemedi — ${await p.textContent(".form-error").catch(() => "?")}`);
  }
  await p.context().close();
}
console.log("gönderilen:", Object.keys(refs).length, "/", cat.SERVICES.length);

// ---- veritabanı kontrolü
const db = new DatabaseSync(DBPATH);
const rows = db.prepare("SELECT ref, kategori, hizmet, cevaplar, butce_tur, ad, eposta FROM talepler").all();
for (const svc of cat.SERVICES) {
  const row = rows.find((x) => x.ref === refs[svc.slug]);
  ok(row && row.hizmet === svc.slug && row.kategori === svc.category, `${svc.slug}: DB kaydı yanlış/eksik`);
  if (row) {
    const ans = JSON.parse(row.cevaplar);
    for (const q of svc.questions.filter((q) => q.required)) ok(ans[q.key] !== undefined, `${svc.slug}: zorunlu cevap "${q.key}" kaydedilmemiş`);
  }
}
const fileCount = db.prepare("SELECT COUNT(*) AS n FROM dosyalar").get().n;
console.log("DB satır:", rows.length, "dosya:", fileCount);

// ---- kategori akışı (kategori → alt hizmet → geri)
{
  const p = await newPage();
  await p.goto(B + "/talep-olustur");
  ok((await p.locator(".cat-opt").count()) === 6, "kategori kartı sayısı 6 değil");
  for (const c of cat.CATEGORIES) {
    await p.click(`.cat-opt:has-text("${c.name}")`);
    const n = await p.locator(".sub-list .choice").count();
    ok(n === cat.servicesOf(c.slug).length, `${c.slug}: alt hizmet sayısı ${n}`);
    await p.click("button:has-text('Geri')");
  }
  // seçim olmadan devam edilemez: kategori seçip hizmet adımında Devam butonu yok
  await p.click(`.cat-opt:has-text("Grafik Tasarım")`);
  ok((await p.locator(".form-nav button:has-text('Devam')").count()) === 0, "alt hizmet seçilmeden Devam görünüyor");
  await p.click(`.choice:has-text("Logo tasarımı")`);
  await p.fill("#q-marka", "Deneme");
  await p.click("button:has-text('Geri')");
  await p.click("button:has-text('Devam')");
  ok((await p.inputValue("#q-marka")) === "Deneme", "geri dönünce cevap kayboldu");
  await p.reload();
  await p.waitForSelector(".fs h2");
  ok((await p.inputValue("#q-marka").catch(() => "")) === "Deneme", "sayfa yenilenince ilerleme korunmadı");
  // geçersiz dosya
  await p.locator('input[name="q-yeni_marka"]').first().locator("xpath=..").click();
  await p.click("button:has-text('Devam')");
  await p.setInputFiles('input[type="file"]', S + "/bad.txt");
  ok((await p.textContent("#e-files").catch(() => "")).includes("yalnızca"), "geçersiz dosya türü reddedilmedi");
  await p.screenshot({ path: S + "/t-budget.png", fullPage: true });
  await p.context().close();
}

// ---- çift gönderim (aynı idem)
{
  const body = { kategori: "grafik-tasarim", hizmet: "logo-tasarimi", cevaplar: { yeni_marka: "evet-yeni-marka", marka: "X" }, butce_tur: "teklif", zaman: "1-hafta", ad: "Çift Deneme", telefon: "05321112233", eposta: "c@ornek.com", tercih: "telefon", kvkk: true, elapsed: 9000, idem: "idem-tekrar-123456789" };
  const post = () => fetch(B + "/api/talep", { method: "POST", headers: { "Content-Type": "application/json", Origin: B }, body: JSON.stringify(body) }).then((r) => r.json());
  const a = await post(), c = await post();
  ok(a.ref && a.ref === c.ref && c.tekrar, "aynı talep iki kez kaydedildi");
  const bad = await fetch(B + "/api/talep", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://kotu.site" }, body: JSON.stringify(body) });
  ok(bad.status === 403, "farklı kaynaktan gelen istek reddedilmedi");
  const inv = await fetch(B + "/api/talep", { method: "POST", headers: { "Content-Type": "application/json", Origin: B }, body: JSON.stringify({ ...body, idem: "baska-idem-1234567890", hizmet: "meta-ads" }) });
  ok(inv.status === 422, "kategoriyle uyuşmayan hizmet kabul edildi");
}

// ---- admin
{
  const p = await newPage();
  const r0 = await p.goto(B + "/admin");
  ok(r0.status() === 401, "admin şifresiz açıldı");
  await p.fill("#pw", "yanlis");
  await p.click("button:has-text('Giriş yap')");
  ok((await p.textContent(".flash")).includes("hatalı"), "yanlış şifre kabul edildi");
  await p.fill("#pw", process.env.ADMIN_PASSWORD);
  await p.click("button:has-text('Giriş yap')");
  await p.waitForLoadState();
  await p.goto(B + "/admin"); // giriş sonrası Özet açılır; talep listesine geç
  await p.waitForSelector(".tbl");
  await p.screenshot({ path: S + "/t-admin-list.png", fullPage: true });
  await p.selectOption("#f-k", "fotograf-video");
  await p.click("button:has-text('Filtrele')");
  ok((await p.locator(".tbl tbody tr").count()) === 8, "kategori filtresi 8 sonuç vermedi");
  await p.goto(B + "/admin?q=" + refs["urun-fotografciligi"]);
  await p.click(`a:has-text('${refs["urun-fotografciligi"]}')`);
  const det = await p.textContent(".adm-main");
  ok(det.includes("Kaç farklı ürün çekilecek?") && det.includes("Ürün fotoğrafçılığı") && det.includes("Fotoğraf & Video"), "detayda kategori/sorular yok");
  ok(det.includes("test1@ornek.com"), "detayda iletişim yok");
  const fileLink = p.locator("a[href^='/admin/dosya/']");
  if (await fileLink.count()) {
    const resp = await p.request.get(B + (await fileLink.first().getAttribute("href")));
    ok(resp.status() === 200 && resp.headers()["content-type"] === "image/png", "dosya indirilemedi");
  } else fails.push("urun-fotografciligi: dosya kaydı görünmüyor");
  await p.selectOption("#d", "teklif-sunuldu");
  await p.click("button:has-text('Durumu güncelle')");
  ok((await p.textContent(".adm-head .badge")).includes("Teklif sunuldu"), "durum güncellenmedi");
  await p.fill("#n", "Yarın aranacak.");
  await p.click("button:has-text('Not ekle')");
  ok((await p.textContent(".timeline")).includes("Yarın aranacak."), "not eklenmedi");
  await p.screenshot({ path: S + "/t-admin-detail.png", fullPage: true });
  await p.goto(B + "/admin?durum=teklif-sunuldu");
  ok((await p.locator(".tbl tbody tr").count()) === 1, "durum filtresi çalışmıyor");
  const csv = await p.request.get(B + "/admin/talepler.csv");
  ok(csv.status() === 200 && (await csv.text()).includes("Ürün fotoğrafçılığı"), "CSV indirilemedi");
  const anon = await fetch(B + "/admin/talepler.csv");
  ok(anon.status === 401, "CSV oturumsuz indirilebiliyor");
  await p.context().close();
}

// ---- mega menü
{
  const p = await newPage(1366);
  await p.goto(B + "/");
  await p.hover(".mega-toggle");
  await p.waitForTimeout(250);
  ok(await p.isVisible(".mega"), "mega menü hover ile açılmadı");
  ok((await p.locator(".mega-card").count()) === 6, "mega menüde 6 kart yok");
  await p.screenshot({ path: S + "/t-mega.png" });
  const m = await newPage(390);
  await m.goto(B + "/");
  await m.click(".menu-toggle");
  await m.click(".mega-toggle");
  await m.waitForTimeout(150);
  ok(await m.isVisible(".mega-card >> nth=5"), "mobil mega menü açılmadı");
  await m.screenshot({ path: S + "/t-mega-m.png" });
  ok(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "mobilde yatay taşma");
}

console.log("hatalar (JS):", errs.slice(0, 5));
console.log(fails.length ? "BAŞARISIZ:\n- " + fails.join("\n- ") : "TÜM KONTROLLER GEÇTİ");
await b.close();
