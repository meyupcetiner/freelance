// Panelden düzenlenen içerik için güvenli markdown alt kümesi.
// HTML üretmez, React öğeleri üretir; bu yüzden içerikteki <script> vb. metin olarak kalır (XSS yok).
// Desteklenenler: ## ve ### başlık, paragraf, "- " liste, "1. " sıralı liste, **kalın**, [metin](/yol veya https://...)
import type { ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={keyBase + i++}>{m[1]}</strong>);
    else {
      const href = m[3];
      const safe = /^(https?:\/\/|\/(?!\/)|mailto:|tel:)/i.test(href);
      if (safe) {
        const ext = /^https?:\/\//i.test(href);
        out.push(
          <a key={keyBase + i++} href={href} {...(ext ? { rel: "noopener nofollow", target: "_blank" } : {})}>
            {m[2]}
          </a>,
        );
      } else out.push(m[2]);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, headingOffset = 0 }: { source: string; headingOffset?: number }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push(<p key={"p" + blocks.length}>{inline(para.join(" "), "p" + blocks.length)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, "li" + i)}</li>);
    blocks.push(list.ordered ? <ol key={"l" + blocks.length}>{items}</ol> : <ul key={"l" + blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^>\s+(.+)$/))) {
      flushPara();
      flushList();
      blocks.push(<aside className="note" key={"q" + blocks.length}>{inline(m[1], "q" + blocks.length)}</aside>);
    } else if ((m = line.match(/^(#{2,3})\s+(.+)$/))) {
      flushPara();
      flushList();
      const level = Math.min(6, m[1].length + headingOffset);
      const H = ("h" + level) as "h2";
      blocks.push(<H key={"h" + blocks.length}>{m[2]}</H>);
    } else if ((m = line.match(/^\s*[-*]\s+(.+)$/))) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.+)$/))) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(m[1]);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <>{blocks}</>;
}

/** Başlıkları (##) çıkarır — sayfa içi gezinme için */
export function headings(source: string): string[] {
  return source
    .split("\n")
    .map((l) => l.match(/^##\s+(.+)$/)?.[1])
    .filter(Boolean) as string[];
}

export const plain = (s: string) => s.replace(/\*\*|__/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
