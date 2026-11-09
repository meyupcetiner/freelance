// Veritabanı katmanı: Node 22'nin yerleşik SQLite sürücüsü (node:sqlite).
// Tüm sorgular parametrelidir; SQL metni kullanıcı girdisiyle birleştirilmez.
// Postgres'e geçiş için yalnızca bu dosya ve SQL lehçe farkları ele alınmalıdır.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config";
import m001 from "../../migrations/001_init.sql";

const MIGRATIONS: { id: string; sql: string }[] = [{ id: "001_init", sql: m001 }];

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  mkdirSync(dirname(config.databasePath), { recursive: true });
  const d = new DatabaseSync(config.databasePath);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  _db = d;
  return d;
}

export function migrate(): string[] {
  const d = db();
  d.exec("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set((d.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    d.exec("BEGIN");
    try {
      d.exec(m.sql);
      d.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(m.id, now());
      d.exec("COMMIT");
      applied.push(m.id);
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  }
  return applied;
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export const now = () => new Date().toISOString();

type P = (string | number | null | bigint)[];
export const q = {
  all<T = any>(sql: string, ...p: P): T[] {
    return db().prepare(sql).all(...p) as T[];
  },
  get<T = any>(sql: string, ...p: P): T | undefined {
    return db().prepare(sql).get(...p) as T | undefined;
  },
  run(sql: string, ...p: P) {
    return db().prepare(sql).run(...p);
  },
};
