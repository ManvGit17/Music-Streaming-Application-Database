import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/** Wait for the app shell; on a fresh browser this includes building the database. */
async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible({
    timeout: 90_000,
  });
}

async function signInAs(page: Page, persona: RegExp) {
  await open(page, "/sign-in");
  await page.getByRole("button", { name: persona }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("first visit builds the database and shows the catalogue", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Starting the database")).toBeVisible();
  await open(page);
  await expect(page.getByRole("heading", { name: "Trending now" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Top artists" }).getByRole("link")).not.toHaveCount(
    0,
  );
});

test("search forgives typos", async ({ page }) => {
  await open(page, "/search?q=midnite%20tran");
  const first = page.getByRole("listitem").filter({ hasText: "Midnight Train" }).first();
  await expect(first).toBeVisible();
  await expect(first.getByText("fuzzy #1")).toBeVisible();
});

test("a search that finds nothing suggests popular tracks", async ({ page }) => {
  await open(page, "/search?q=zzzzzz");
  await expect(page.getByText("Nothing matched")).toBeVisible();
  const suggestions = page.getByRole("region", { name: "Popular right now" });
  await expect(suggestions.getByRole("button", { name: /^Play / })).toHaveCount(3);
});

test("the top bar shows the database role", async ({ page }) => {
  await open(page);
  await expect(page.getByText("Database role: anon")).toBeVisible();
  await signInAs(page, /John Doe/);
  await expect(page.getByText("Database role: listener")).toBeVisible();
  await signInAs(page, /^Admin/);
  await expect(page.getByText("Database role: admin")).toBeVisible();
});

test("a public playlist's link can be copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInAs(page, /John Doe/);
  await page.getByRole("button", { name: "Create a playlist" }).click();
  await expect(page).toHaveURL(/\/playlist\//);
  await page.getByRole("button", { name: "Copy link" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Link copied/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  await page.getByRole("button", { name: "Make private" }).click();
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
});

test("a listener can sign in, play a song and see it in their history", async ({ page }) => {
  await signInAs(page, /John Doe/);
  await expect(page.getByRole("heading", { name: /John\./ })).toBeVisible();
  await page.getByRole("heading", { name: "Trending now" }).scrollIntoViewIfNeeded();
  const row = page
    .locator("ol li")
    .filter({ has: page.getByRole("button", { name: /^Play / }) })
    .first();
  const title = (await row.locator("p.font-medium").first().innerText())
    .replace(/\s*E$/, "")
    .trim();
  await row.getByRole("button", { name: /^Play / }).click();
  await expect(page.getByRole("region", { name: "Player" }).getByText(title)).toBeVisible();
  // Plays shorter than five seconds aren't recorded. Wait on the player's own clock rather
  // than a fixed delay, which a busy machine can outrun, then skip to record this one.
  const player = page.getByRole("region", { name: "Player" });
  await expect(player.getByText(/^0:(0[6-9]|[1-5]\d)$/).first()).toBeVisible({ timeout: 30_000 });
  await player.getByRole("button", { name: "Next" }).click();
  // Navigate inside the app, as a listener would: a full reload could beat the write to
  // IndexedDB that persists the play.
  await page.getByRole("link", { name: "Your library" }).click();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("tabpanel").getByText(title).first()).toBeVisible();
});

test("the SQL Lens shows each statement with its plan", async ({ page }) => {
  await signInAs(page, /John Doe/);
  await page.getByRole("button", { name: "SQL Lens", exact: true }).click();
  const lens = page.getByRole("complementary", { name: "SQL Lens" });
  await expect(lens.getByText("as vamusic_listener").first()).toBeVisible();
  await lens
    .getByRole("button", { name: /library\.recommendations|catalog\.trending/ })
    .first()
    .click();
  await expect(lens.getByText("Execution plan")).toBeVisible();
  await expect(lens.getByRole("list", { name: "Query plan" })).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await lens
    .getByRole("button", { name: /^Copy the SQL for / })
    .first()
    .click();
  await expect(page.getByText(/SQL copied/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^-- \w+\.\w+/);
});

test("row-level security hides another listener's private playlist", async ({ page }) => {
  await signInAs(page, /John Doe/);
  await page.getByRole("button", { name: "Create a playlist" }).click();
  await expect(page).toHaveURL(/\/playlist\//);
  const url = page.url();
  await page.getByRole("button", { name: "Make private" }).click();
  await expect(page.getByText("Private playlist")).toBeVisible();

  await signInAs(page, /Jane Smith/);
  await page.goto(url);
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByText(/playlist not found/)).toBeVisible();
});

test("admins see operations; listeners don't", async ({ page }) => {
  await signInAs(page, /John Doe/);
  await page.goto("/admin");
  await expect(page.getByText(/needs the vamusic_admin role/)).toBeVisible();

  await signInAs(page, /^Admin/);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
  await expect(page.getByText("Partitions")).toBeVisible();
});

for (const path of ["/", "/search", "/sign-in", "/atlas"]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await open(page, path);
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // React Flow's canvas is a pannable diagram; its internal nodes aren't page content.
      .exclude(".react-flow__renderer")
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([]);
  });
}
