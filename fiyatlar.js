// BRIF fiyat rehberi. Bu dosyadaki rakamlar bütçe hesaplayıcısında, talep formunda,
// hizmet sayfalarında ve fiyat rehberi sayfasında kullanılır. Yeniden derleme gerekmez.
//
// base     : taban tutar (₺)
// perUnit  : birim başına tutar (₺) — birim, unitLabel'da yazan şeydir (ürün, saat, video...)
// addons   : seçilirse alt sınıra eklenen tutarlar
// tiers    : kapsam seviyeleri; from/to aralığı (₺), to: null = üst sınır yok
// Rakamlar kesin teklif değildir, sitede "rehber" olarak gösterilir.
window.FIYAT_REHBERI = {
  // Ürün fotoğrafçılığı
  "urun-fotografcisi": {
    base: 3000, perUnit: 400, unitLabel: "ürün",
    addons: [
      {"key":"cekim_turu","values":["konsept","kullanim"],"amount":4000,"label":"Konsept veya kullanım çekimi"},
      {"key":"rotus","values":["ileri"],"amount":2000,"label":"İleri rötuş"},
      {"key":"foto_adedi","values":["4-6"],"amount":2000,"label":"Ürün başına 4+ fotoğraf"},
    ],
    tiers: [
      {"name":"Temel","from":0,"to":12000,"includes":["Az sayıda ürün","Beyaz fon","Temel düzeltme"]},
      {"name":"Standart","from":12000,"to":35000,"includes":["Orta ölçekli katalog","Beyaz fon + detay","Pazaryeri ölçüleri"]},
      {"name":"Kapsamlı","from":35000,"to":null,"includes":["Geniş katalog","Konsept çekim","İleri rötuş"]},
    ],
  },
  // Etkinlik fotoğrafçılığı
  "etkinlik-fotografcisi": {
    base: 3000, perUnit: 1500, unitLabel: "saat",
    addons: [
      {"key":"teslim","values":["ayni-gun"],"amount":2000,"label":"Aynı gün seçki"},
    ],
    tiers: [
      {"name":"Kısa etkinlik","from":0,"to":9000,"includes":["2 saate kadar","Şehir içi","Düzenlenmiş seçki"]},
      {"name":"Yarım / tam gün","from":9000,"to":20000,"includes":["4–8 saat","Tüm iyi karelerin teslimi"]},
      {"name":"Çok günlü","from":20000,"to":null,"includes":["Birden fazla gün","Gerekirse ikinci fotoğrafçı"]},
    ],
  },
  // Düğün ve nişan fotoğrafçılığı
  "dugun-fotografcisi": {
    base: 6000, perUnit: 2500, unitLabel: "saatlik kapsam",
    addons: [
      {"key":"album","values":["evet"],"amount":5000,"label":"Basılı albüm"},
    ],
    tiers: [
      {"name":"Tek bölüm","from":0,"to":15000,"includes":["Nişan, kına veya dış çekim"]},
      {"name":"Düğün günü","from":15000,"to":35000,"includes":["Tören + dış çekim","Dijital teslim"]},
      {"name":"Tam gün","from":35000,"to":null,"includes":["Hazırlıktan kapanışa","Albüm seçeneği"]},
    ],
  },
  // Tanıtım ve etkinlik videosu
  "tanitim-videosu-cekimi": {
    base: 10000, perUnit: 6000, unitLabel: "video",
    addons: [
      {"key":"sure","values":["uzun"],"amount":6000,"label":"3 dakikadan uzun video"},
      {"key":"ekstralar","values":["senaryo"],"amount":3000,"label":"Senaryo"},
      {"key":"ekstralar","values":["animasyon"],"amount":4000,"label":"Grafik / animasyon"},
      {"key":"ekstralar","values":["drone"],"amount":3000,"label":"Drone"},
    ],
    tiers: [
      {"name":"Kısa video","from":0,"to":20000,"includes":["1 kısa video","Tek lokasyon","Lisanslı müzik"]},
      {"name":"Tanıtım filmi","from":20000,"to":50000,"includes":["1–3 dk film","Senaryo desteği","Yatay + dikey kurgu"]},
      {"name":"Kapsamlı prodüksiyon","from":50000,"to":null,"includes":["Çoklu video","Ekip ve ek ekipman"]},
    ],
  },
  // Reels video çekimi
  "reels-video-cekimi": {
    base: 2000, perUnit: 2000, unitLabel: "video",
    addons: [
      {"key":"cekim","values":["cekim-kurgu"],"amount":3000,"label":"Çekim günü"},
      {"key":"ekstralar","values":["fikir"],"amount":2000,"label":"İçerik fikri / senaryo"},
    ],
    tiers: [
      {"name":"Deneme paketi","from":0,"to":12000,"includes":["Birkaç video","Tek çekim günü"]},
      {"name":"Düzenli üretim","from":12000,"to":30000,"includes":["Aylık 6–12 video","Fikir + çekim + kurgu"]},
      {"name":"Yoğun üretim","from":30000,"to":null,"includes":["Çok sayıda video","Birden fazla çekim günü"]},
    ],
  },
  // Video kurgu ve montaj
  "video-editoru": {
    base: 1000, perUnit: 1500, unitLabel: "video",
    addons: [
      {"key":"final_sure","values":["uzun"],"amount":3000,"label":"10 dakikadan uzun video"},
      {"key":"ekstralar","values":["grafik"],"amount":1500,"label":"Grafik animasyon"},
    ],
    tiers: [
      {"name":"Kısa kurgu","from":0,"to":6000,"includes":["Birkaç kısa video","Temel renk ve ses"]},
      {"name":"Düzenli kurgu","from":6000,"to":20000,"includes":["Çoklu video","Altyazı ve grafik"]},
      {"name":"Uzun format","from":20000,"to":null,"includes":["YouTube / podcast","Kapsamlı düzenleme"]},
    ],
  },
  // Sosyal medya yönetimi
  "sosyal-medya-yonetimi": {
    base: 8000, perUnit: 600, unitLabel: "aylık içerik",
    addons: [
      {"key":"icerik_turu","values":["reels"],"amount":5000,"label":"Reels üretimi"},
      {"key":"icerik_turu","values":["cekim"],"amount":4000,"label":"Fotoğraf çekimi"},
      {"key":"topluluk","values":["evet"],"amount":3000,"label":"Topluluk yönetimi"},
    ],
    tiers: [
      {"name":"Başlangıç","from":0,"to":15000,"includes":["Aylık plan","Tasarım gönderiler","Yayın"]},
      {"name":"Büyüme","from":15000,"to":35000,"includes":["Tasarım + Reels","Aylık rapor"]},
      {"name":"Tam yönetim","from":35000,"to":null,"includes":["Çekim + video","Topluluk yönetimi","Çoklu platform"]},
    ],
  },
  // Meta reklam yönetimi
  "meta-reklam-yonetimi": {
    base: 10000, perUnit: 5000, unitLabel: "harcama kademesi",
    addons: [
      {"key":"kapsam","values":["kreatif"],"amount":5000,"label":"Kreatif üretimi"},
      {"key":"kapsam","values":["kurulum"],"amount":3000,"label":"Ölçüm kurulumu"},
    ],
    tiers: [
      {"name":"Kurulum / analiz","from":0,"to":12000,"includes":["Hesap analizi","Ölçüm kontrolü","Yol haritası"]},
      {"name":"Aylık yönetim","from":12000,"to":25000,"includes":["Kampanya yönetimi","Kreatif testi","Aylık rapor"]},
      {"name":"Yoğun yönetim","from":25000,"to":null,"includes":["Yüksek harcama","Çoklu kampanya","Haftalık rapor"]},
    ],
  },
  // Grafik ve sosyal medya tasarımı
  "grafik-tasarim": {
    base: 1500, perUnit: 700, unitLabel: "tasarım",
    addons: [
      {"key":"tasarim_turu","values":["logo"],"amount":6000,"label":"Logo / kimlik"},
    ],
    tiers: [
      {"name":"Tekil işler","from":0,"to":6000,"includes":["Birkaç tasarım","Hazır içerikle"]},
      {"name":"Set / şablon","from":6000,"to":20000,"includes":["Şablon seti","Katalog veya menü"]},
      {"name":"Kimlik","from":20000,"to":null,"includes":["Logo + kimlik","Kullanım kılavuzu"]},
    ],
  },
};
