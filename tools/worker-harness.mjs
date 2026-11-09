// Yerel Cloudflare Worker taklidi: worker.js + D1 (node:sqlite) + statik ASSETS
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const [, , siteArg = "site", dbPath = "data/yerel.db", port = "3000"] = process.argv;
const siteDir = resolve(siteArg);
mkdirSync(resolve(dbPath, ".."), { recursive: true });
const worker = (await import(pathToFileURL(join(siteDir, "worker.js")).href)).default;
const db = new DatabaseSync(dbPath);
db.exec(readFileSync(join(siteDir, "schema.sql"), "utf8"));

const D1 = {
  prepare(sql) {
    const st = db.prepare(sql);
    let args = [];
    const o = {
      bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return o; },
      async run() { const r = st.run(...args); return { results: [], meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
      async first() { return st.get(...args) ?? null; },
      async all() { return { results: st.all(...args), meta: {} }; },
    };
    return o;
  },
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
};
const T = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain", ".webp": "image/webp", ".woff2": "font/woff2" };
const ASSETS = {
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    let f = p === "/" ? join(siteDir, "index.html") : join(siteDir, p);
    if (!(existsSync(f) && statSync(f).isFile())) f = existsSync(f + ".html") ? f + ".html" : null;
    if (!f) return new Response(readFileSync(join(siteDir, "404.html")), { status: 404, headers: { "Content-Type": T[".html"] } });
    return new Response(readFileSync(f), { headers: { "Content-Type": T[extname(f)] || "application/octet-stream" } });
  },
};
const env = { DB: D1, ASSETS, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD };

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", "10.0." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250));
  const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request("http://" + req.headers.host + req.url, { method: req.method, headers, body }), env);
  const h = {};
  r.headers.forEach((v, k) => (h[k] = v));
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) h["set-cookie"] = sc;
  res.writeHead(r.status, h);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(Number(port), () => console.log("harness ready", port));
