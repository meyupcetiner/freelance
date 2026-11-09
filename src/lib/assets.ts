// Statik dosyalara içerik özetli sürüm ekler (?v=...), böylece uzun süreli önbellek güvenle kullanılabilir.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cache = new Map<string, string>();
export const PUBLIC_DIR = join(process.cwd(), "public");

export function asset(path: string): string {
  const prod = process.env.NODE_ENV === "production";
  if (prod && cache.has(path)) return cache.get(path)!;
  let v = "0";
  try {
    v = createHash("sha1").update(readFileSync(join(PUBLIC_DIR, path))).digest("hex").slice(0, 10);
  } catch {
    /* dosya yoksa sürümsüz döner */
  }
  const out = `${path}?v=${v}`;
  cache.set(path, out);
  return out;
}
