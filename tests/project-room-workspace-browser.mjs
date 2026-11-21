const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(
  `${
    process.env.PROJECT_ROOM_TEST_URL || "http://127.0.0.1:3012"
  }/tests/fixtures/project-room.html?scenario=report`,
);
await page.getByRole("heading", { name: "What needs you today?" }).waitFor();
await page.getByRole("button", { name: /1 Ready to review/ }).waitFor();
await page.screenshot({
  path: "tests/fixtures/project-room-workspace-today.png",
  fullPage: true,
});
const nav = page.getByRole("navigation", { name: "Project workspace" });
await nav.getByRole("button", { name: "Companies", exact: true }).click();
await page.getByLabel("Find a company").fill("Example");
await page.getByRole("button", { name: "Open Example Company", exact: true })
  .waitFor();
await page.screenshot({
  path: "tests/fixtures/project-room-workspace-companies.png",
  fullPage: true,
});
await page.getByRole("button", { name: "Open Example Company", exact: true })
  .click();
await page.getByLabel("Follow up on").fill("2026-11-06");
await page.getByLabel("What should we follow up about?").fill(
  "Discuss website",
);
await page.getByRole("button", { name: "Save follow-up", exact: true }).click();
await page.getByRole("button", { name: "Archive company", exact: true })
  .click();
await page.getByRole("button", { name: "Restore company", exact: true })
  .waitFor();
await nav.getByRole("button", { name: "Companies", exact: true }).click();
await page.getByRole("button", { name: "Archived 1", exact: true }).click();
await page.getByRole("button", { name: "Open Example Company", exact: true })
  .click();
await page.getByRole("button", { name: "Restore company", exact: true })
  .click();
await page.getByRole("button", { name: "Archive company", exact: true })
  .waitFor();
await page.getByRole("button", { name: "Share room", exact: true }).click();
await page.getByRole("button", { name: "Add Sheree", exact: true }).click();
await page.getByText("Sheree · member", { exact: true }).waitFor();
await page.getByRole("button", { name: "Remove access", exact: true }).click();
await page.getByRole("button", { name: "Add Sheree", exact: true }).waitFor();
await page.getByLabel("Search words").fill("website");
await page.getByRole("button", { name: "Search notes", exact: true }).click();
await page.getByText("Discuss website improvements at the next meeting.", {
  exact: true,
}).waitFor();
await page.screenshot({
  path: "tests/fixtures/project-room-workspace-overview.png",
  fullPage: true,
});
const tabs = page.getByRole("navigation", { name: "Company room pages" });
await tabs.getByRole("button", { name: "Notes & calls", exact: true }).click();
await page.getByLabel("Meeting title", { exact: true }).fill(
  "Website planning",
);
await page.getByLabel("Meeting date and time").fill("2026-11-07T09:00");
await page.getByLabel("Notes and next steps").fill("Prepare website scope.");
await page.getByRole("button", { name: "Save meeting notes", exact: true })
  .click();
await page.getByRole("heading", { name: "Website planning", exact: true })
  .waitFor();
await tabs.getByRole("button", { name: "Files", exact: true }).click();
const downloadEvent = page.waitForEvent("download");
await page.getByRole("button", { name: "Download Word document", exact: true })
  .click();
const download = await downloadEvent;
assert.match(download.suggestedFilename(), /\.docx$/);
assert.equal(await download.failure(), null);
await tabs.getByRole("button", { name: "Research", exact: true }).click();
await page.getByRole("heading", { name: "Living brief", exact: true })
  .waitFor();
await page.getByRole("button", { name: "Download Word document", exact: true })
  .waitFor();
await tabs.getByRole("button", { name: "Overview", exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
await page.screenshot({
  path: "tests/fixtures/project-room-workspace-mobile.png",
  fullPage: true,
});
await nav.getByRole("button", { name: "Today", exact: true }).click();
await page.getByRole("button", { name: /1 Follow up/ }).waitFor();
await nav.getByRole("button", { name: "Feature ideas", exact: true }).click();
await page.getByText(
  "No feature ideas yet. Start one to work through it with the team.",
  { exact: true },
).waitFor();
await page.getByRole("button", { name: "Start a feature idea", exact: true })
  .click();
assert.equal(
  await page.getByText("Company for this briefing", { exact: false }).count(),
  0,
);
await page.getByLabel("Product or project name").fill("Smart reminder feature");
await page.getByLabel("What problem are we solving?").fill(
  "Help people remember follow-ups without losing context.",
);
await page.getByLabel("Who is it for, and what should they be able to do?")
  .fill("Our team should see the next action.");
await page.getByLabel("What would make the first version successful?").fill(
  "A reminder appears on the selected date.",
);
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.getByRole("button", {
  name: "Continue without documents",
  exact: true,
}).click();
await page.getByRole("button", { name: "Create private room", exact: true })
  .click();
await page.getByRole("heading", { name: "Smart reminder feature", exact: true })
  .waitFor();
await page.getByRole("button", { name: "← All feature ideas", exact: true })
  .click();
await page.getByRole("button", { name: /Smart reminder feature/ }).click();
await page.getByRole("button", { name: "Start research", exact: true })
  .waitFor();
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
assert.deepEqual(errors, []);
console.log(
  "PASS: real Today counts, company filters, archive/restore, sharing, Sage evidence, notes, DOCX download, research, mobile width, no errors.",
);
await browser.close();
