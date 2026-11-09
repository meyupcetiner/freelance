// Yönetim paneli için küçük yardımcılar: onay isteyen işlemler, JSON alan doğrulaması, mobil menü.
document.addEventListener("submit", (e) => {
  const f = e.target as HTMLFormElement;
  const msg = f.dataset.confirm;
  if (msg && !confirm(msg)) e.preventDefault();
  // JSON alanlarını göndermeden önce doğrula — sunucu da ayrıca doğrular
  for (const ta of Array.from(f.querySelectorAll<HTMLTextAreaElement>("textarea[data-json]"))) {
    try {
      JSON.parse(ta.value || "null");
      ta.setCustomValidity("");
    } catch (err) {
      ta.setCustomValidity("Geçerli JSON değil: " + (err as Error).message);
      ta.reportValidity();
      e.preventDefault();
      return;
    }
  }
});
document.addEventListener("input", (e) => {
  const t = e.target as HTMLTextAreaElement;
  if (t.matches?.("textarea[data-json]")) t.setCustomValidity("");
});
document.querySelector(".adm-menu")?.addEventListener("click", () => document.body.classList.toggle("adm-nav-open"));
// Filtre seçimleri değiştiğinde formu otomatik gönder
for (const s of Array.from(document.querySelectorAll<HTMLSelectElement>("select[data-autosubmit]"))) {
  s.addEventListener("change", () => s.form?.requestSubmit());
}
