// Görsel yer tutucuları: gerçek görseller gelene kadar numaralı boş kutular.
// Numara (G01…) ve içerik tarifi, görsel teslim edilirken eşleştirmek içindir.
export function Ph({ n, text, ratio }: { n: string; text: string; ratio?: string }) {
  return (
    <span className="ph" data-ph={n}>
      <span className="ph-n">{n}</span>
      <span className="ph-t">{text}</span>
      {ratio ? <span className="ph-r">{ratio}</span> : null}
    </span>
  );
}

export const HERO_PH = {
  photo: { n: "G01", text: "Ürün fotoğrafı (stüdyo, tek ürün)", ratio: "4:5 dikey" },
  poster: { n: "G02", text: "Grafik tasarım örneği (afiş / logo)", ratio: "4:5 dikey" },
  web: { n: "G03", text: "Web sitesi ekran görüntüsü (masaüstü)", ratio: "16:10 yatay" },
  video: { n: "G04", text: "Video karesi / Reels kapağı", ratio: "16:9 yatay" },
};

export const CATEGORY_PH: Record<string, { n: string; text: string }> = {
  "fotograf-video": { n: "G05", text: "Fotoğraf & video: çekim anı ya da ürün çekimi" },
  "grafik-tasarim": { n: "G06", text: "Grafik tasarım: logo / kurumsal kimlik sunumu" },
  "web-yazilim": { n: "G07", text: "Web tasarım: site ekranı (masaüstü + mobil)" },
  "reklam-eticaret": { n: "G08", text: "Reklam & e-ticaret: reklam görseli ya da panel" },
  "sosyal-medya": { n: "G09", text: "Sosyal medya: gönderi / profil ızgarası" },
  "metin-icerik": { n: "G10", text: "Metin & içerik: blog / metin sayfası" },
};

export const PORTFOLIO_PH: { n: string; kategori: string; baslik: string; ratio: string }[] = [
  { n: "G11", kategori: "Fotoğraf", baslik: "Ürün / ambalaj çekimi", ratio: "dikey, büyük" },
  { n: "G12", kategori: "Web tasarım", baslik: "Açılış sayfası, masaüstü ve mobil", ratio: "yatay, geniş" },
  { n: "G13", kategori: "Grafik tasarım", baslik: "Afiş ya da logo çalışması", ratio: "kare" },
  { n: "G14", kategori: "Video", baslik: "Video karesi / kurgu", ratio: "yatay" },
  { n: "G15", kategori: "Sosyal medya", baslik: "Karusel / gönderi seti", ratio: "yatay, geniş" },
  { n: "G16", kategori: "Reklam", baslik: "Kampanya banner seti", ratio: "yatay, geniş" },
];

// Kategori görselleri (G05–G10 yerine). Görsel düzenleyiciden değiştirilebilir.
export const CATEGORY_IMG: Record<string, { src: string; alt: string; pos: string }> = {
  "fotograf-video": { src: "/assets/kategori/fotograf-video.webp", alt: "Gimbal üzerindeki kamerayla stüdyoda çekim yapan görüntü yönetmeni", pos: "40% 35%" },
  "grafik-tasarim": { src: "/assets/kategori/grafik-tasarim.webp", alt: "Grafik tablet ve kalemle tasarım yapan tasarımcı", pos: "50% 60%" },
  "web-yazilim": { src: "/assets/kategori/web-yazilim.webp", alt: "Bilgisayar ekranında web projesi üzerinde düşünen geliştirici", pos: "45% 35%" },
  "reklam-eticaret": { src: "/assets/kategori/reklam-eticaret.webp", alt: "Raporların yanında masasında oturan reklam uzmanı", pos: "50% 30%" },
  "sosyal-medya": { src: "/assets/kategori/sosyal-medya.webp", alt: "Dizüstü bilgisayarla sosyal medya içeriği hazırlayan kişi", pos: "55% 30%" },
  "metin-icerik": { src: "/assets/kategori/metin-icerik.webp", alt: "Gece masasında not alarak metin yazan içerik üreticisi", pos: "60% 40%" },
};
export function CatImg({ slug }: { slug: string }) {
  const c = CATEGORY_IMG[slug];
  return <img className="ph-img" src={c.src} alt={c.alt} loading="lazy" decoding="async" width={1200} height={800} style={{ objectPosition: c.pos }} />;
}
