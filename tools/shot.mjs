import { chromium } from "playwright";
const [,, out, ...urls] = process.argv;
const b = await chromium.launch({ args: ["--no-sandbox"] });
for (const spec of urls) {
  const [u, w = "1366", name, full = "1"] = spec.split("|");
  const p = await b.newPage({ viewport: { width: +w, height: +w < 500 ? 844 : 860 } });
  const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:3000" + u, { waitUntil: "networkidle" });
  for(let y=0;y<14000;y+=400){await p.mouse.wheel(0,400);await p.waitForTimeout(40);}await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: full === "1" });
  if (errs.length) console.log(name, "ERR:", errs.join(" | "));
  await p.close();
}
await b.close();
