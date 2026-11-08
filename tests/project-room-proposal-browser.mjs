import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(
  `${
    process.env.PROJECT_ROOM_TEST_URL || "http://127.0.0.1:3013"
  }/tests/fixtures/project-room.html?scenario=report`,
);
const nav = page.getByRole("navigation", { name: "Project workspace" });
await nav.getByRole("button", { name: "Sales pipeline", exact: true }).click();
await page.getByText("Not priced yet", { exact: true }).waitFor();
await page.getByRole("button", { name: /Open proposal for/ }).click();
await page.getByRole("button", { name: "Generate proposal draft", exact: true })
  .click();
await page.getByRole("button", { name: "Download proposal Word", exact: true })
  .waitFor();
assert.equal(
  await page.getByRole("button", {
    name: "Download proposal Word",
    exact: true,
  }).isEnabled(),
  false,
);
assert.equal(await page.getByRole("combobox", {name: "Frequency"}).count(), 0);
assert.equal(await page.getByText("Priced monthly fees", {exact: true}).count(), 0);
const outcomeBox = await page.getByLabel("What success looks like").boundingBox();
const priceBox = await page.getByRole("heading", {name: "One-time project investment"}).boundingBox();
assert.ok(outcomeBox.y < priceBox.y);
await page.getByRole("button", {name:"Estimate work from this client's research", exact:true}).click();
await page.getByRole("button", {name:"Use estimated breakdown", exact:true}).click();
assert.equal(await page.getByLabel("Estimated hours",{exact:true}).first().inputValue(), "2");
assert.equal(await page.getByLabel("Assumptions and reason for hours").first().inputValue(), "One owner interview and notes.");
await page.getByLabel("Expected close date").fill("2026-12-01");
await page.getByRole("button", { name: "Save proposal", exact: true }).first()
  .click();
await page.getByRole("button", { name: "Download proposal Word", exact: true })
  .waitFor({ state: "visible" });
await page.getByRole("button", { name: "Download proposal Word", exact: true })
  .isEnabled();
const fileEvent = page.waitForEvent("download");
await page.getByRole("button", { name: "Download proposal Word", exact: true })
  .click();
const file = await fileEvent;
assert.match(file.suggestedFilename(), /proposal-guide\.docx$/);
assert.equal(await file.failure(), null);
await page.screenshot({
  path: "tests/fixtures/proposal-desktop.png",
  fullPage: true,
});
await nav.getByRole("button", { name: "Sales pipeline", exact: true }).click();
await page.getByText("$300.00 one-time", { exact: true })
  .waitFor();
await page.screenshot({
  path: "tests/fixtures/pipeline-desktop.png",
  fullPage: true,
});
await page.getByRole("button", { name: /Open proposal for/ }).click();
await page.getByLabel("Sales stage").selectOption("won");
await page.getByRole("button", { name: "Save proposal", exact: true }).first()
  .click();
await page.getByText(
  "Unsaved changes. Save to update the pipeline and download.",
  { exact: true },
).waitFor({ state: "hidden" });
await nav.getByRole("button", { name: "Sales pipeline", exact: true }).click();
const openFees = page.locator(".pr-metric").filter({
  hasText: "Open one-time fees",
});
assert.match(await openFees.innerText(), /\$0\.00/);
const wonFees = page.locator(".pr-metric").filter({
  hasText: "Won one-time fees",
});
assert.match(await wonFees.innerText(), /\$300\.00/);
await page.setViewportSize({ width: 390, height: 844 });
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
await page.screenshot({
  path: "tests/fixtures/pipeline-mobile.png",
  fullPage: true,
});
await page.getByRole("button", { name: /Open proposal for/ }).click();
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PASS: proposal creation, estimated fees, save, Word download, pipeline totals and Won transition, mobile layout, no page errors.",
);
