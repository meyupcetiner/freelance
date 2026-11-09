// Tek komutla sunucu + istemci paketlerini üretir.
// Sunucu: dist/server.js, dist/cli.js  |  İstemci: public/assets/*.js
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";

const watch = process.argv.includes("--watch");
const prod = process.env.NODE_ENV === "production" || !watch;

const server = {
  entryPoints: { server: "src/server.tsx", cli: "src/cli.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  jsx: "automatic",
  sourcemap: true,
  loader: { ".sql": "text" },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  define: { "process.env.NODE_ENV": JSON.stringify(prod ? "production" : "development") },
  logLevel: "info",
};

const client = {
  entryPoints: { talep: "src/client/talep.tsx", site: "src/client/site.ts", admin: "src/client/admin.ts", home: "src/client/home.ts", editor: "src/client/editor.ts" },
  outdir: "public/assets",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: ["es2020", "safari15"],
  jsx: "automatic",
  minify: prod,
  sourcemap: !prod,
  define: { "process.env.NODE_ENV": JSON.stringify(prod ? "production" : "development") },
  logLevel: "info",
};

if (!watch) {
  await Promise.all([esbuild.build(server), esbuild.build(client)]);
} else {
  let child;
  const restart = {
    name: "restart",
    setup(b) {
      b.onEnd((r) => {
        if (r.errors.length) return;
        child?.kill();
        child = spawn("node", ["--disable-warning=ExperimentalWarning", "--enable-source-maps", "dist/server.js"], { stdio: "inherit" });
      });
    },
  };
  const sc = await esbuild.context({ ...server, plugins: [restart] });
  const cc = await esbuild.context(client);
  await Promise.all([sc.watch(), cc.watch()]);
}
