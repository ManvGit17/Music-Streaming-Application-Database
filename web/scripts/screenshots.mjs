// Walks through the app in headless Chromium and saves a screenshot of each screen.
//
//   node scripts/screenshots.mjs [base-url] [out-dir]
//
// Used to review the UI and to produce the README images. Expects the app to be running
// (npm run dev or npm run preview).

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5199";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  reducedMotion: "no-preference",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
// On GitHub Pages every deep link is served by 404.html (the SPA fallback), which the console
// reports as a failed load even though the app renders. That one message isn't a problem.
const pagesFallback = !/localhost|127\.0\.0\.1/.test(base);
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (pagesFallback && m.text().includes("status of 404")) return;
  errors.push(`console: ${m.text().slice(0, 300)}`);
});

const shot = async (name, opts = {}) => {
  await page.waitForTimeout(opts.wait ?? 900);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: opts.full ?? false });
  console.log(`saved ${name}.png`);
};
const step = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    errors.push(`step "${label}" failed: ${e.message.split("\n")[0]}`);
  }
};

await page.goto(base);
// First visit builds the database in the page; wait for the app shell.
await page.getByRole("navigation", { name: "Main" }).first().waitFor({ timeout: 120_000 });
await shot("01-home-signed-out", { wait: 1500 });
await shot("02-home-signed-out-full", { full: true });

await step("sign in", async () => {
  await page.getByRole("button", { name: /Explore as a listener/ }).click();
  await page.getByText(/Made for you/).waitFor({ timeout: 20_000 });
  await shot("03-home-signed-in", { wait: 1800 });
});

await step("play", async () => {
  await page.getByRole("button", { name: /^Play / }).first().click();
  await shot("04-playing", { wait: 2500 });
});

await step("lens", async () => {
  await page.getByRole("button", { name: "SQL Lens", exact: true }).click();
  await page.waitForTimeout(2500);
  await shot("05-lens", { wait: 500 });
  const statement = page.locator("aside[aria-label='SQL Lens'] li li button").nth(2);
  await statement.click();
  await shot("06-lens-plan", { wait: 800 });
  await page.getByRole("button", { name: "Close the SQL Lens" }).click();
});

await step("search", async () => {
  await page.goto(`${base}/search?q=midnite%20tran`);
  await page.getByText(/Results for/).waitFor({ timeout: 20_000 });
  await shot("07-search", { wait: 1200 });
});

await step("palette", async () => {
  await page.keyboard.press("Control+k");
  await page.keyboard.type("luna");
  await shot("08-palette", { wait: 1200 });
  await page.keyboard.press("Escape");
});

await step("artist", async () => {
  await page.goto(`${base}/`);
  await page.getByRole("region", { name: "Top artists" }).getByRole("link").first().click();
  await page.getByText("Popular").waitFor();
  await shot("09-artist", { wait: 1200 });
});

await step("album", async () => {
  await page.getByRole("link", { name: /\d{4} ·/ }).first().click();
  await shot("10-album", { wait: 1200 });
});

await step("now playing", async () => {
  await page.getByRole("button", { name: "Play album" }).click();
  await page.getByRole("button", { name: "Open the now-playing view" }).click();
  await shot("11-now-playing", { wait: 2500 });
  await page.keyboard.press("Escape");
});

await step("library", async () => {
  await page.goto(`${base}/library`);
  await shot("12-library", { wait: 1500 });
});

await step("playlist", async () => {
  await page.getByRole("tab", { name: "Playlists" }).click();
  await page.locator("a[href*='/playlist/']").first().click();
  await shot("13-playlist", { wait: 1500 });
});

await step("wrapped", async () => {
  await page.goto(`${base}/wrapped`);
  await page.getByText(/Minutes listened/).waitFor({ timeout: 20_000 });
  await shot("14-wrapped", { wait: 2000, full: true });
});

await step("atlas", async () => {
  await page.goto(`${base}/atlas`);
  await page.locator(".react-flow__node").first().waitFor({ timeout: 20_000 });
  await shot("15-atlas", { wait: 1500 });
  await page.locator(".react-flow__node").filter({ hasText: "listening_event" }).first().click();
  await shot("16-atlas-details", { wait: 800 });
});

await step("admin", async () => {
  await page.goto(`${base}/sign-in`);
  await page.getByRole("button", { name: /^Admin/ }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/sign-in"));
  await page.goto(`${base}/admin`);
  await page.getByText("Operations").waitFor();
  await shot("17-admin", { wait: 2000, full: true });
});

await step("light theme", async () => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${base}/`);
  await shot("18-home-light", { wait: 1500 });
});

await step("mobile", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${base}/`);
  await shot("19-mobile", { wait: 1500 });
});

await browser.close();
if (errors.length) {
  console.log("\nProblems:");
  for (const e of errors) console.log(`  ${e}`);
  process.exitCode = 1;
}
