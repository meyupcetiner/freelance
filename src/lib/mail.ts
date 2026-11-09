// E-posta bildirimi (Resend HTTP API). RESEND_API_KEY ve MAIL_FROM yoksa gönderim yapılmaz, yalnızca uyarı loglanır.
import { config } from "./config";

export const mailConfigured = () => !!(config.resendApiKey && config.mailFrom);

export async function sendMail(m: { to: string; subject: string; text: string }) {
  if (!mailConfigured()) {
    console.warn("[mail] RESEND_API_KEY / MAIL_FROM tanımlı değil; bildirim gönderilmedi.");
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.mailFrom, to: [m.to], subject: m.subject, text: m.text }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}
