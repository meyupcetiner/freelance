// Talep oluşturma: sunucu tarafı doğrulama, spam koruması, kayıt ve bildirim.
import { randomInt } from "node:crypto";
import { config } from "./config";
import { q, now, tx } from "./db";
import { services, settings } from "./repo";
import { validateTalep } from "./talep";
import { estimate, isBudgetLow, type Answers, type Question } from "./pricing";
import { sendMail } from "./mail";

const TIMINGS = new Set(["acil", "1-hafta", "2-4-hafta", "belirli-tarih", "belli-degil"]);
const PREFS = new Set(["email", "phone", "whatsapp"]);
const OTHER = "diger";

export class ValidationError extends Error {
  constructor(public fields: Record<string, string>, message = "Bazı alanları kontrol etmen gerekiyor.") {
    super(message);
  }
}

/** Kontrol karakterlerini atar, boşlukları sadeleştirir, uzunluğu sınırlar. HTML kaçışı görünüm katmanında (React) yapılır. */
export function clean(v: unknown, max: number, multiline = false): string {
  if (typeof v !== "string") return "";
  let s = v.normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮]/g, "");
  s = multiline ? s.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max);
}

function cleanAnswers(questions: Question[], raw: unknown, fields: Record<string, string>): Answers {
  const out: Answers = {};
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const qq of questions) {
    const a = src[qq.key];
    if (qq.type === "checkboxes") {
      const allowed = new Set(qq.options?.map((o) => o.value));
      const vals = Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && allowed.has(x)) : [];
      if (vals.length) out[qq.key] = [...new Set(vals)];
    } else if (qq.type === "radio" || qq.type === "select") {
      if (typeof a === "string" && qq.options?.some((o) => o.value === a)) out[qq.key] = a;
    } else if (qq.type === "number") {
      if (a !== undefined && a !== "") {
        const n = Number(a);
        if (!Number.isInteger(n) || n < (qq.min ?? 0) || (qq.max !== undefined && n > qq.max)) fields["q_" + qq.key] = "Geçerli bir sayı gir.";
        else out[qq.key] = String(n);
      }
    } else {
      const s = clean(a, qq.type === "textarea" ? 1000 : 200, qq.type === "textarea");
      if (s) out[qq.key] = s;
    }
    if (qq.required && out[qq.key] === undefined && !fields["q_" + qq.key]) fields["q_" + qq.key] = "Bu soruyu yanıtla.";
  }
  return out;
}

function newRef(): string {
  const d = new Date();
  const ym = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, "0");
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY3479"; // karışan karakterler yok
  for (let i = 0; i < 5; i++) {
    let tail = "";
    for (let j = 0; j < 5; j++) tail += alphabet[randomInt(alphabet.length)];
    const ref = `T-${ym}-${tail}`;
    if (!q.get("SELECT 1 FROM requests WHERE ref = ?", ref)) return ref;
  }
  throw new Error("Talep numarası üretilemedi.");
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!config.turnstileSecret) return true; // yapılandırılmamışsa devre dışı
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: config.turnstileSecret, response: token, remoteip: ip }),
    });
    const d = (await r.json()) as { success?: boolean };
    return !!d.success;
  } catch {
    return false;
  }
}

export type SpamVerdict = "ok" | "silent-drop";

export async function createRequest(body: any, ip: string): Promise<{ ref: string; dropped?: boolean }> {
  // Bot işaretleri: bal küpü doluysa veya form 4 saniyeden kısa sürede doldurulduysa sessizce kabul edilmiş gibi davran.
  if (clean(body?.website, 200) || Number(body?.elapsed) < 4000) return { ref: "T-0000-00000", dropped: true };
  if (!(await verifyTurnstile(String(body?.turnstile || ""), ip))) throw new ValidationError({}, "Güvenlik doğrulaması tamamlanamadı. Sayfayı yenileyip tekrar dene.");

  const priced = new Map(services({ publishedOnly: true }).map((x) => [x.slug, x.pricing.enabled ? x.pricing : null]));
  const v = validateTalep(body, (ref) => priced.get(ref) ?? null);
  if (!v.ok) throw new ValidationError(v.fields, v.message);
  const k = v.kayit;

  const ref = newRef();
  const ts = now();
  const status = q.get<{ id: number }>("SELECT id FROM statuses ORDER BY sort, id LIMIT 1")!;
  const pref = k.tercih === "eposta" ? "email" : k.tercih === "whatsapp" ? "whatsapp" : "phone";
  const answers = { ...k.cevaplar, __hizmet: k.hizmet };
  tx(() => {
    const r = q.run(
      `INSERT INTO requests (ref, created_at, updated_at, service_id, service_name, category_slug, answers, description,
        budget_amount, budget_mode, estimate_min, budget_warned, timing, timing_date, contact_name, contact_email, contact_phone,
        contact_pref, company, privacy_ack_at, status_id, src_source, src_medium, src_campaign, src_referrer, src_landing)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ref, ts, ts, k.hizmet_ad, k.kategori, JSON.stringify(answers), k.aciklama,
      k.butce, k.butce_tur === "teklif" ? "quote" : "amount", k.rehber_min, k.butce_dusuk ? 1 : 0, k.zaman, k.zaman_tarih, k.ad, k.eposta, k.telefon,
      pref, k.firma, ts, status.id, k.kaynak.source, k.kaynak.medium, k.kaynak.campaign, k.kaynak.referrer, k.kaynak.landing,
    );
    q.run("INSERT INTO request_activity (request_id, kind, body, created_at) VALUES (?, 'created', ?, ?)", Number(r.lastInsertRowid), `Talep form üzerinden oluşturuldu (${k.kategori_ad} › ${k.hizmet_ad}).`, ts);
  });

  const s = settings();
  if (s.notify_email) {
    sendMail({
      to: s.notify_email,
      subject: `Yeni talep: ${k.hizmet_ad} (${ref})`,
      text: `Yeni bir talep geldi.\n\nKategori: ${k.kategori_ad}\nHizmet: ${k.hizmet_ad}\nTalep no: ${ref}\n\nAyrıntılar: ${config.siteUrl}/admin/talepler?q=${encodeURIComponent(ref)}`,
    }).catch((e) => console.error("[mail] bildirim gönderilemedi:", e.message));
  }
  return { ref };
}

// ---- Anonim olaylar ----
const EVENT_NAMES = new Set(["page_view", "form_start", "form_step", "form_submit", "budget_warning"]);
export function recordEvent(body: any) {
  const name = String(body?.name || "");
  if (!EVENT_NAMES.has(name)) return;
  const path = clean(body?.path, 200).split("?")[0];
  if (!path.startsWith("/") || path.startsWith("/admin")) return;
  const service = clean(body?.service, 80).replace(/[^a-z0-9-]/g, "");
  const stepN = Number(body?.step);
  const step = Number.isInteger(stepN) && stepN >= 1 && stepN <= 10 ? stepN : null;
  const source = clean(body?.source, 40).replace(/[^\w.-]/g, "").toLowerCase();
  q.run("INSERT INTO events (day, name, path, service, step, source) VALUES (?, ?, ?, ?, ?, ?)", new Date().toISOString().slice(0, 10), name, path, service, step, source);
}
