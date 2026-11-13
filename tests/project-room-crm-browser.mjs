import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE,
});
const origin = process.env.PROJECT_ROOM_TEST_URL || "http://127.0.0.1:3018";
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) => {
  const url = route.request().url();
  return url.startsWith(origin) || url.startsWith("data:")
    ? route.continue()
    : route.abort();
});
const tabs = page.getByRole("navigation", { name: "Company room pages" });
const contacts = page.getByRole("region", { name: "Client contacts" });
async function open(params = "") {
  await page.goto(
    `${origin}/tests/fixtures/project-room.html?scenario=report&crm${params}`,
  );
  await page.getByRole("button", { name: /1 Ready to review/ }).waitFor();
  await page.getByRole("button", { name: "Companies", exact: true }).click();
  await page.getByRole("button", { name: "Open Example Company", exact: true })
    .click();
}
await open("&contact-fails");
await contacts.getByRole("button", { name: "Add contact", exact: true })
  .click();
await page.getByLabel("Contact name", { exact: true }).fill("Alex Painter");
await page.getByLabel("Role / job title").fill("Owner");
await page.getByLabel("Contact email", { exact: true }).fill(
  "alex@example.org",
);
await page.getByLabel("Contact phone", { exact: true }).fill("+1 555 123 4567");
await page.getByLabel("Contact notes", { exact: true }).fill(
  "Approves the discovery scope.",
);
await contacts.getByRole("button", { name: "Save contacts", exact: true })
  .click();
await contacts.getByRole("alert").filter({ hasText: "Company changed" })
  .waitFor();
assert.equal(
  await page.getByLabel("Contact name", { exact: true }).inputValue(),
  "Alex Painter",
  "failed saves keep edits",
);
await contacts.getByRole("button", { name: "Save contacts", exact: true })
  .click();
await contacts.getByRole("button", { name: "Edit Alex Painter", exact: true })
  .waitFor();
await contacts.getByRole("link", { name: "alex@example.org" }).waitFor();
await contacts.getByRole("button", { name: "Add contact", exact: true }).click();
await page.getByLabel("Contact name", { exact: true }).fill("Pat Manager");
await page.getByLabel("Contact email", { exact: true }).fill("pat@example.org");
await page.getByLabel("Role / job title").fill("Project manager");
await page.getByLabel("Primary contact", { exact: true }).check();
await contacts.getByRole("button", { name: "Save contacts", exact: true }).click();
await contacts.getByRole("button", { name: "Edit Pat Manager", exact: true }).waitFor();
await contacts.locator("article").filter({hasText:"Pat Manager"}).getByText("Primary",{exact:true}).waitFor();
assert.equal(await contacts.locator("article").filter({hasText:"Alex Painter"}).getByText("Primary",{exact:true}).count(),0);
await page.screenshot({
  path: "output/crm-contacts-desktop.png",
  fullPage: true,
});
await page.getByRole("button", { name: "Companies", exact: true }).click();
await page.getByLabel("Find a company").fill("alex@example.org");
await page.getByRole("button", { name: "Open Example Company", exact: true })
  .click();
await contacts.getByRole("button", { name: "Edit Alex Painter", exact: true })
  .waitFor();
await contacts.locator("article").filter({hasText:"Alex Painter"}).getByRole("button", { name: "Archive contact", exact: true })
  .click();
await contacts.getByRole("button", { name: "Save contacts", exact: true })
  .click();
await contacts.getByRole("button", { name: "Show archived contacts" }).click();
await contacts.getByRole("button", { name: "Restore contact" }).click();
await contacts.getByRole("button", { name: "Save contacts", exact: true })
  .click();
await contacts.getByRole("button", { name: "Edit Alex Painter", exact: true })
  .waitFor();
await page.setViewportSize({ width: 390, height: 844 });
await contacts.scrollIntoViewIfNeeded();
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  "contacts fit mobile",
);
await page.screenshot({
  path: "output/crm-contacts-mobile.png",
  fullPage: true,
});
// Blank MIME represents an external Markdown file on systems without a MIME mapping.
await open("&upload-fails&completion-fails");
await tabs.getByRole("button", { name: "Files", exact: true }).click();
const bytes = Buffer.from(
  "# Discovery proposal\nOriginal scope and fee: $500.\n",
);
const original = { name: "Discovery.md", mimeType: "", buffer: bytes };
await page.getByLabel("Choose original project file").setInputFiles(original);
await page.getByRole("button", { name: "Retry upload Discovery.md" }).waitFor();
await page.getByRole("button", { name: "Retry upload Discovery.md" }).click();
await page.getByLabel("Choose original project file").setInputFiles(original);
await page.getByRole("region", { name: "Original project files" }).getByRole(
  "alert",
).filter({ hasText: "saving did not" }).waitFor();
await page.getByRole("button", { name: "Finish saving Discovery.md" }).click();
await page.getByRole("button", { name: "Download Discovery.md", exact: true })
  .waitFor();
assert.equal(
  await page.getByRole("heading", { name: "Discovery.md", exact: true })
    .count(),
  1,
  "retries keep one file",
);
await page.screenshot({ path: "output/crm-files-mobile.png", fullPage: true });
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  "files fit mobile",
);
const downloadEvent = page.waitForEvent("download");
await page.getByRole("button", { name: "Download Discovery.md", exact: true })
  .click();
const download = await downloadEvent;
assert.equal(download.suggestedFilename(), "Discovery.md");
assert.deepEqual(
  await readFile(await download.path()),
  bytes,
  "download preserves the original bytes",
);
await page.reload();
await page.getByRole("button", { name: "Companies", exact: true }).click();
await page.getByRole("button", { name: "Open Example Company", exact: true })
  .click();
await contacts.getByRole("button", { name: "Edit Alex Painter", exact: true })
  .waitFor();
await tabs.getByRole("button", { name: "Files", exact: true }).click();
await page.getByRole("button", { name: "Download Discovery.md", exact: true })
  .waitFor();
await page.setViewportSize({ width: 1440, height: 1050 });
await page.screenshot({ path: "output/crm-files-desktop.png", fullPage: true });
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "CRM browser passed: contacts save/retry/archive/restore/search, reload persistence, interrupted upload recovery, exact original download, mobile width and no page errors. Synthetic responses only.",
);
