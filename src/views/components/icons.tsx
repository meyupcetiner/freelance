// İkonlar: öncelik Freelancer Outline setinde (pack-icons.ts). Sette karşılığı olmayanlar (ok, onay, ₺ bütçe vb.)
// aynı çizgi karakterinde elle çizilmiş 24×24 ikonlardır. Renk currentColor'dan gelir.
import type { ReactNode } from "react";
import { PACK } from "./pack-icons";

/** Eski ikon adlarını setteki karşılığına bağlar */
const ALIAS: Record<string, string> = {
  kamera: "pk-foto",
  fotografcilik: "pk-foto",
  video: "pk-video",
  palet: "pk-tasarim",
  tasarim: "pk-tasarim",
  kod: "pk-web",
  grafik: "pk-pazarlama",
  reklam: "pk-pazarlama",
  instagram: "pk-sosyal",
  "sosyal-medya": "pk-sosyal",
  kalem: "pk-metin",
  anlat: "pk-sohbet",
  mesaj: "pk-sohbet",
  incele: "pk-incele",
  kisi: "pk-kisi",
  kapsam: "pk-liste",
};

const P: Record<string, ReactNode> = {
  kamera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  fotografcilik: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      <path d="m16 10.5 5-3v9l-5-3" />
    </>
  ),
  "sosyal-medya": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M8 13.5c1.2 1.6 2.6 2.5 4 2.5s2.8-.9 4-2.5" />
      <path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" />
    </>
  ),
  reklam: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z" />
      <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  tasarim: (
    <>
      <path d="m12 3 7 7-7 11-7-11z" />
      <circle cx="12" cy="11" r="1.6" />
      <path d="M12 3v6.4" />
    </>
  ),
  diger: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  // süreç adımları
  anlat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 9h8M8 12.5h5" />,
  butce: (
    <>
      <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
      <path d="M3.5 10h17M15.5 14.5h2" />
    </>
  ),
  incele: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5M8.5 11l1.8 1.8L13.5 9.5" />
    </>
  ),
  basla: (
    <>
      <path d="M5 12.5 9.5 17 19 7.5" />
    </>
  ),
  // güven
  kisi: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.2 3.8-5 7-5s5.8 1.8 7 5" />
    </>
  ),
  kapsam: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </>
  ),
  pusula: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  mesaj: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3v-3h0.5A2.5 2.5 0 0 1 4 14.5z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6" />
    </>
  ),
  ok: <path d="M5 12h14M13 6l6 6-6 6" />,
  // ana kategoriler
  palet: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1a4.3 4.3 0 0 0 4.3-4.3C21 6.6 17 3.5 12 3.5z" />
      <path d="M7.5 12h.01M9.5 8h.01M14.5 8h.01" strokeWidth="2.6" />
    </>
  ),
  kod: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />,
  grafik: <path d="M4 20V14M9 20v-8M14 20v-5M19 20V9M4 9.5l5-4 5 3 6-5.5M16.5 3H20v3.5" />,
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <path d="M17 7h.01" strokeWidth="2.6" />
    </>
  ),
  kalem: (
    <>
      <path d="M4 20l1.5-5.5L15 5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3l-9.5 9.5z" />
      <path d="M13 7l4 4M4 20l5-1.5" />
    </>
  ),
};

export function Icon({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const pk = PACK[ALIAS[name] || name];
  if (pk) {
    // Küçük boyutlarda çizgiler kaybolmasın diye kontur, boyut küçüldükçe kalınlaşır
    const sw = size <= 20 ? 3.4 : size <= 28 ? 2.6 : size <= 40 ? 1.6 : 0.6;
    return (
      <svg viewBox="0 0 128 128" width={size} height={size} fill="currentColor" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" aria-hidden="true" className={className}>
        {pk.map((e, i) => (e[0] === "p" ? <path key={i} d={e[1]} /> : <circle key={i} cx={e[1]} cy={e[2]} r={e[3]} />))}
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {P[name] ?? P.diger}
    </svg>
  );
}
