// Regenerates public/icons/*.png from scripts/icon.html. Run manually after
// changing the design (needs a local Chromium):  CHR=/path/to/chrome node scripts/make-icons.mjs
// The PNGs are committed, so normal builds don't need this.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
const src = new URL("./icon.html", import.meta.url);
const out = fileURLToPath(new URL("../public/icons/", import.meta.url));
const targets = [
  ["apple-touch-icon.png", 180, 0],   // iOS home screen (iOS rounds the corners itself)
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 0.28], // Android adaptive icons crop to a circle/squircle
];
const browser = await chromium.launch({ executablePath: process.env.CHR });
for (const [name, size, pad] of targets) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: size / 1024 });
  await page.goto(`${src.href}?pad=${pad}`);
  await page.locator(".icon").screenshot({ path: out + name });
  await page.close();
}
await browser.close();
console.log("icons written to", out);
