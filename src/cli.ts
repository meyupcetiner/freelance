// Komut satırı: npm run migrate | seed | admin:create -- <email> <ad> [admin|editor]
// Parola ADMIN_PASSWORD ortam değişkeninden okunur (kabuk geçmişine düşmemesi için argüman olarak alınmaz).
import { migrate, q, now } from "./lib/db";
import { seed } from "./lib/bootstrap";
import { hashPassword } from "./lib/security";
import { createInterface } from "node:readline/promises";

const [cmd, ...args] = process.argv.slice(2);

async function main() {
  if (cmd === "migrate") {
    const a = migrate();
    console.log(a.length ? `Uygulandı: ${a.join(", ")}` : "Şema güncel.");
  } else if (cmd === "seed") {
    migrate();
    const s = seed();
    console.log(s.length ? `Başlangıç verisi yazıldı: ${s.join(", ")}` : "Tablolar zaten dolu, değişiklik yapılmadı.");
  } else if (cmd === "create-admin") {
    migrate();
    const [email, name = "Yönetici", role = "admin"] = args;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Kullanım: npm run admin:create -- e-posta@ornek.com \"Ad Soyad\" [admin|editor]");
    if (!["admin", "editor"].includes(role)) throw new Error("Rol admin veya editor olmalı.");
    let pw = process.env.ADMIN_PASSWORD || "";
    if (!pw) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      pw = await rl.question("Parola (en az 12 karakter): ");
      rl.close();
    }
    if (pw.length < 12) throw new Error("Parola en az 12 karakter olmalı.");
    const hash = await hashPassword(pw);
    const ex = q.get<{ id: number }>("SELECT id FROM users WHERE email = ?", email);
    if (ex) {
      q.run("UPDATE users SET password_hash = ?, role = ?, name = ?, active = 1 WHERE id = ?", hash, role, name, ex.id);
      q.run("DELETE FROM sessions WHERE user_id = ?", ex.id);
      console.log(`Kullanıcı güncellendi: ${email} (${role})`);
    } else {
      q.run("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)", email, name, hash, role, now());
      console.log(`Kullanıcı oluşturuldu: ${email} (${role})`);
    }
  } else {
    console.log("Komutlar: migrate | seed | create-admin <email> <ad> [admin|editor]");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Hata:", e.message);
  process.exit(1);
});
