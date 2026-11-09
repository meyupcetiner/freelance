// Uçtan uca duman testi: geçici veritabanıyla sunucuyu başlatır, temel akışları HTTP üzerinden doğrular.
// Kullanım: npm run build && npm test
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "smoke-"));
const port = 3900 + Math.floor(Math.random() * 90);
const B = `http://localhost:${port}`;
const env = { ...process.env, PORT: String(port), DATABASE_PATH: join(dir, "t.db"), APP_SECRET: "smoke-test-secret-0123456789abcdef", SITE_URL: B, ADMIN_PASSWORD: "smoke-parola-123456" };
const nodeArgs = ["--disable-warning=ExperimentalWarning"];
execFileSync("node", [...nodeArgs, "dist/cli.js", "create-admin", "a@test.local", "Test", "admin"], { env, stdio: "ignore" });
const srv = spawn("node", [...nodeArgs, "dist/server.js"], { env, stdio: ["ignore", "ignore", "inherit"] });

let fails = 0;
const ok = (cond, name) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fails++;
};

try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(B + "/robots.txt");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const get = (p, o = {}) => fetch(B + p, { redirect: "manual", ...o });

  for (const p of ["/", "/hizmetler", "/hizmetler/urun-fotografcisi", "/hizmetler/meta-reklam-yonetimi", "/talep-olustur", "/fiyat-rehberi", "/nasil-calisir", "/sss", "/kvkk-aydinlatma-metni"]) {
    const r = await get(p);
    const html = await r.text();
    ok(r.status === 200 && /<h1/.test(html) && /rel="canonical" href="http/.test(html), `${p} 200, H1 ve canonical var`);
  }
  ok((await get("/yok-boyle-sayfa")).status === 404, "Bilinmeyen sayfa 404");
  ok((await get("/Hizmetler/")).status === 301, "Büyük harf / sondaki eğik çizgi 301");
  const sm = await (await get("/sitemap.xml")).text();
  ok(sm.includes(`${B}/hizmetler/urun-fotografcisi`) && !sm.includes("/admin"), "Sitemap hizmet sayfalarını içeriyor, admin yok");
  const home = await (await get("/")).text();
  const titles = new Set();
  for (const p of ["/", "/hizmetler/urun-fotografcisi", "/hizmetler/video-editoru"]) titles.add((await (await get(p)).text()).match(/<title>(.*?)<\/title>/)[1]);
  ok(titles.size === 3, "Sayfa başlıkları benzersiz");
  ok(home.includes('application/ld+json'), "Ana sayfada yapılandırılmış veri var");

  const H = { "Content-Type": "application/json", Origin: B };
  const valid = { kategori: "fotograf-video", hizmet: "urun-fotografciligi", cevaplar: { urun_sayisi: "25", urun_konumu: "gonderebilirim", cekim_turu: ["beyaz-fon"] }, butce_tur: "tutar", butce: 3000, zaman: "1-hafta", ad: "Deneme Kişi", telefon: "0532 111 22 33", eposta: "d@test.local", tercih: "eposta", kvkk: true, elapsed: 9000, idem: "smoke-idem-1234567890", kaynak: {} };
  ok((await get("/api/talep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid) })).status === 403, "Origin'siz talep reddedildi");
  const bad = await get("/api/talep", { method: "POST", headers: H, body: JSON.stringify({ ...valid, ad: "", kvkk: false }) });
  ok(bad.status === 422, "Eksik alanlı talep 422");
  const good = await get("/api/talep", { method: "POST", headers: H, body: JSON.stringify(valid) });
  const gj = await good.json();
  ok(good.status === 201 && /^T-\d{4}-[A-Z0-9]{5}$/.test(gj.ref), "Geçerli talep kaydedildi: " + gj.ref);

  ok((await get("/admin/talepler")).status === 303, "Oturumsuz admin girişe yönlendiriliyor");
  const login = await get("/admin/giris", { method: "POST", headers: { Origin: B, "Content-Type": "application/x-www-form-urlencoded" }, body: "email=a@test.local&password=smoke-parola-123456" });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  ok(login.status === 303 && cookie.startsWith("sid="), "Admin girişi");
  const list = await (await get("/admin/talepler", { headers: { cookie } })).text();
  ok(list.includes(gj.ref), "Talep panelde listeleniyor");
  const id = list.match(/href="\/admin\/talepler\/(\d+)"/)[1];
  const detail = await (await get(`/admin/talepler/${id}`, { headers: { cookie } })).text();
  ok(detail.includes("Bütçe rehberin altında"), "Düşük bütçe uyarısı kayıtta işaretli");
  const csrf = detail.match(/name="csrf" value="([^"]+)"/)[1];
  const noCsrf = await get(`/admin/talepler/${id}`, { method: "POST", headers: { cookie, Origin: B, "Content-Type": "application/x-www-form-urlencoded" }, body: "action=contact" });
  ok(noCsrf.status === 403, "CSRF jetonsuz işlem reddedildi");
  const st = await get(`/admin/talepler/${id}`, { method: "POST", headers: { cookie, Origin: B, "Content-Type": "application/x-www-form-urlencoded" }, body: `csrf=${encodeURIComponent(csrf)}&action=status&status_id=2` });
  ok(st.status === 303, "Durum güncellendi");
  const after = await (await get(`/admin/talepler/${id}`, { headers: { cookie } })).text();
  ok(after.includes("Durum: Yeni → İnceleniyor"), "Durum değişikliği işlem geçmişinde");
} catch (e) {
  console.error(e);
  fails++;
} finally {
  srv.kill();
  rmSync(dir, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} test başarısız` : "\nTüm testler geçti");
process.exit(fails ? 1 : 0);
