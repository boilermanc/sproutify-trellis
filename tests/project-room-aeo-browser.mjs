import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${process.env.PROJECT_ROOM_TEST_URL || "http://127.0.0.1:3012"}/tests/fixtures/project-room.html?scenario=report&automatic-aeo`);
  const workspace = page.getByRole("navigation", { name: "Project workspace" });
  await workspace.getByRole("button", { name: "Companies", exact: true }).click();
  await page.getByRole("button", { name: "Open Example Company", exact: true }).click();
  await page.getByRole("navigation", { name: "Company room pages" })
    .getByRole("button", { name: "Research", exact: true }).click();
  const baseline = page.getByRole("region", { name: "AI search (AEO) baseline" });
  await baseline.getByLabel("Public buyer category").fill("interior painting in Atlanta");
  await baseline.getByRole("button", { name: "Save five buyer questions" }).click();
  await baseline.getByRole("button", { name: "Record check for question 1" }).click();
  await baseline.getByLabel("Observed result").selectOption("mentioned");
  await baseline.getByLabel("Other brands or competitors named").fill("Acme Painting");
  await baseline.getByLabel("Public citation URLs", { exact: false }).fill("https://example.org/acme");
  await baseline.getByRole("button", { name: "Save check" }).click();
  await baseline.getByText("1 of 5 checked · 1/1 answers mentioned the brand").waitFor();
  await baseline.getByRole("link", { name: "Citation 1: example.org" }).waitFor();
  await baseline.getByLabel("AI surface").selectOption("google_ai_overviews");
  await baseline.getByRole("button", { name: "Record check for question 1" }).click();
  await baseline.getByLabel("Observed result").selectOption("no_answer");
  await baseline.getByRole("button", { name: "Save check" }).click();
  await baseline.getByText("1 of 5 checked · No answers measured").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("button", { name: "Start another pass" }).click();
  await baseline.getByText("Included in round 1's evidence.").waitFor();
  const automatic = baseline.getByRole("region", { name: "OpenAI web search" });
  await automatic.getByText("1 of 5 usable answers · Brand named in 1", { exact: false }).waitFor();
  await automatic.getByText("Other options: Another Painter").waitFor();
  assert.equal(await automatic.getByRole("link", { name: "Local options" }).getAttribute("href"), "https://example.org/options");
  assert.equal(await automatic.getByText("No usable cited answer", { exact: false }).count(), 4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.PROJECT_ROOM_AEO_SCREENSHOT) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await automatic.screenshot({ path: process.env.PROJECT_ROOM_AEO_SCREENSHOT });
  }
  assert.equal(await baseline.getByRole("button", { name: /record check|edit check/i }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: saved coverage, competitor and citation, no-answer handling, mobile width, and round snapshot");
} finally {
  await browser.close();
}
