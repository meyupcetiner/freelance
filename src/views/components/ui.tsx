import type { ReactNode } from "react";
import type { Service, Category } from "../../lib/repo";

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Konum" className="crumbs">
      <ol>
        {items.map((it, i) => (
          <li key={it.path}>
            {i < items.length - 1 ? <a href={it.path}>{it.name}</a> : <span aria-current="page">{it.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function FaqList({ items, headingLevel = 3 }: { items: { q: string; a: string }[]; headingLevel?: 2 | 3 }) {
  const H = ("h" + headingLevel) as "h3";
  return (
    <div className="faq">
      {items.map((f, i) => (
        <details key={i}>
          <summary>
            <H>{f.q}</H>
          </summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function ServiceIndex({ cats, services }: { cats: Category[]; services: Service[] }) {
  return (
    <div className="svc-index">
      {cats.map((c) => {
        const list = services.filter((s) => s.category_id === c.id);
        if (!list.length) return null;
        return (
          <section key={c.slug} id={c.slug} className="svc-group" aria-labelledby={"cat-" + c.slug}>
            <h3 id={"cat-" + c.slug} className="svc-group-h">
              {c.name}
            </h3>
            <ul>
              {list.map((s) => (
                <li key={s.slug}>
                  <a href={`/hizmetler/${s.slug}`} className="svc-row">
                    <span className="svc-name">{s.name}</span>
                    <span className="svc-sum">{s.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function CtaBand({ title, text, href = "/talep-olustur", label = "Talep oluştur" }: { title: string; text: string; href?: string; label?: string }) {
  return (
    <section className="cta-band">
      <div className="wrap cta-inner">
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
        <a className="btn btn-signal btn-lg" href={href}>
          {label}
        </a>
      </div>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose">{children}</div>;
}
