// Produces the README and repository images from the running app.
//
//   node scripts/media.mjs [base-url] [out-dir]
//
// Writes still screenshots, frames for the demo animation, and the 1280×640 social preview.
// scripts/make_media.py (repository root) then turns them into WebP and GIF files.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5199";
const out = resolve(process.argv[3] ?? "media");
mkdirSync(join(out, "frames"), { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
const page = await context.newPage();

const still = async (name, wait = 1200) => {
  await page.mouse.move(1430, 450);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`still ${name}`);
};

// The demo animation comes from the DevTools screencast: JPEG frames with timestamps.
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  frames.push({ data, at: metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const startRecording = () =>
  cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1440, maxHeight: 900 });
const stopRecording = () => cdp.send("Page.stopScreencast");
await page.goto(base);
await page.getByRole("navigation", { name: "Main" }).first().waitFor({ timeout: 120_000 });
await page.waitForTimeout(1500);
await still("hero-signed-out");

// --- the demo animation: sign in, play, open the lens, open the now-playing view --------------
await startRecording();
await page.waitForTimeout(900);
await page.getByRole("button", { name: /Explore as a listener/ }).click();
await page.getByText(/Made for you/).waitFor({ timeout: 20_000 });
await page.waitForTimeout(1600);
await page.getByRole("button", { name: /^Play / }).first().click();
await page.waitForTimeout(2600);
await page.getByRole("button", { name: "SQL Lens", exact: true }).click();
await page.waitForTimeout(2000);
const lens = page.getByRole("complementary", { name: "SQL Lens" });
await lens.getByRole("button", { name: /library\.recommendations/ }).first().click();
await page.waitForTimeout(2600);
await page.getByRole("button", { name: "Close the SQL Lens" }).click();
await page.getByRole("button", { name: "Open the now-playing view" }).click();
await page.waitForTimeout(3200);
await stopRecording();
for (const [i, { data, at }] of frames.entries()) {
  const name = `${String(i).padStart(4, "0")}-${Math.round(at * 1000)}.jpg`;
  writeFileSync(join(out, "frames", name), Buffer.from(data, "base64"));
}
await page.getByRole("button", { name: "Close the now-playing view" }).click();

await page.getByRole("button", { name: "SQL Lens", exact: true }).click();
await lens.getByRole("button", { name: /library\.recommendations/ }).first().click();
await still("lens");
await page.getByRole("button", { name: "Close the SQL Lens" }).click();
await page.getByRole("button", { name: "Open the now-playing view" }).click();
await still("now-playing", 1500);

// --- more stills ------------------------------------------------------------------------------
await page.goto(`${base}/search?q=midnite%20tran`);
await page.getByText(/Results for/).waitFor();
await still("search");

await page.goto(`${base}/wrapped`);
await page.getByText(/Minutes listened/).waitFor();
await still("wrapped", 2000);

await page.goto(`${base}/atlas`);
await page.locator(".react-flow__node").first().waitFor();
await page.locator(".react-flow__node").filter({ hasText: "listening_event" }).first().click();
await still("atlas");

await page.emulateMedia({ colorScheme: "light" });
await page.goto(`${base}/`);
await page.getByText(/Made for you/).waitFor();
await still("home-light", 2500);

await page.emulateMedia({ colorScheme: "dark" });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/`);
await still("mobile", 2000);

// --- social preview (1280×640), drawn with the app's own fonts ---------------------------------
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(resolve("node_modules", pkg, "files", file)).toString("base64")}`;
const shot = `data:image/png;base64,${readFileSync(join(out, "lens.png")).toString("base64")}`;
const logo = readFileSync(resolve("..", "docs", "assets", "logo.svg"), "utf8");

const card = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await card.setContent(`<!doctype html><html><head><style>
  @font-face { font-family: Fraunces; src: url(${font("@fontsource-variable/fraunces", "fraunces-latin-wght-normal.woff2")}); font-weight: 100 900; }
  @font-face { font-family: Inter; src: url(${font("@fontsource-variable/inter", "inter-latin-wght-normal.woff2")}); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1280px; height: 640px; overflow: hidden; font-family: Inter; color: #f6f1ea;
    background: radial-gradient(50rem 30rem at 0% 0%, #5a2a26 0%, transparent 60%),
                radial-gradient(40rem 30rem at 100% 100%, #2c3a24 0%, transparent 60%), #120d0c; }
  .copy { position: absolute; left: 72px; top: 92px; width: 560px; }
  .logo { width: 76px; height: 76px; margin-bottom: 34px; }
  h1 { font-family: Fraunces; font-weight: 500; font-size: 92px; letter-spacing: -0.03em; line-height: 0.95; }
  h2 { font-family: Fraunces; font-style: italic; font-weight: 400; font-size: 46px; color: #ffad94; margin-top: 18px; line-height: 1.05; letter-spacing: -0.02em; }
  p { margin-top: 30px; font-size: 21px; line-height: 1.5; color: #cfc6bc; }
  .tags { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 10px; }
  .tags span { border: 1px solid #ffffff26; border-radius: 999px; padding: 7px 14px; font-size: 16px; color: #e8dfd5; }
  .shot { position: absolute; left: 690px; top: 70px; width: 820px; border-radius: 22px;
    box-shadow: 0 40px 90px -20px #000c, 0 0 0 1px #ffffff1a; }
</style></head><body>
  <div class="copy">
    <div class="logo">${logo}</div>
    <h1>VaMusic</h1>
    <h2>Music, with the database showing.</h2>
    <p>A streaming app built on PostgreSQL 18. The demo runs the real database in your browser.</p>
    <div class="tags"><span>pgvector</span><span>row-level security</span><span>partitions</span><span>PGlite</span></div>
  </div>
  <img class="shot" src="${shot}" alt="">
</body></html>`);
await card.waitForTimeout(500);
await card.screenshot({ path: join(out, "social-preview.png") });
console.log("still social-preview");

await browser.close();
console.log(`${frames.length} animation frames`);
