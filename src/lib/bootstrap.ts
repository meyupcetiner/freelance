import { q, now, tx } from "./db";
import { seedCategories, seedPages, seedServices, seedStatuses } from "../data/seed";

/** Boş tablolara başlangıç verisini yazar. Var olan veriye dokunmaz. */
export function seed(): string[] {
  const done: string[] = [];
  tx(() => {
    if (!q.get("SELECT 1 FROM categories LIMIT 1")) {
      seedCategories.forEach((c, i) => q.run("INSERT INTO categories (slug, name, description, sort) VALUES (?, ?, ?, ?)", c.slug, c.name, c.description, i));
      done.push("categories");
    }
    if (!q.get("SELECT 1 FROM statuses LIMIT 1")) {
      seedStatuses.forEach((s, i) => q.run("INSERT INTO statuses (key, label, tone, is_open, sort) VALUES (?, ?, ?, ?, ?)", s.key, s.label, s.tone, s.is_open, i));
      done.push("statuses");
    }
    if (!q.get("SELECT 1 FROM services LIMIT 1")) {
      const ts = now();
      seedServices.forEach((s, i) => {
        const cat = q.get<{ id: number }>("SELECT id FROM categories WHERE slug = ?", s.category)!;
        q.run(
          `INSERT INTO services (slug, category_id, name, h1, seo_title, meta_description, summary, body, faq, questions, pricing, related, published, sort, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          s.slug, cat.id, s.name, s.h1, s.seo_title, s.meta_description, s.summary, s.body,
          JSON.stringify(s.faq), JSON.stringify(s.questions), JSON.stringify({ ...s.pricing, updatedAt: ts.slice(0, 10) }),
          JSON.stringify(s.related), i, ts, ts,
        );
      });
      done.push("services");
    }
    if (!q.get("SELECT 1 FROM pages LIMIT 1")) {
      for (const p of seedPages)
        q.run(
          "INSERT INTO pages (slug, title, seo_title, meta_description, body, is_legal, reviewed, published, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)",
          p.slug, p.title, p.seo_title, p.meta_description, p.body, p.is_legal, now(),
        );
      done.push("pages");
    }
  });
  return done;
}
