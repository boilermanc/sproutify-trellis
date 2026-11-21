import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `${
      process.env.CUSTOMER_DOCUMENT_TEST_URL || "http://127.0.0.1:3015"
    }/tests/fixtures/customer-document.html`,
  );
  assert.equal(
    await page.getByRole("button", {
      name: "Build customer draft",
      exact: true,
    }).count(),
    0,
  );
  await page.getByRole("button", {
    name: "Create customer document",
    exact: true,
  }).click();
  const build = page.getByRole("button", {
    name: "Build customer draft",
    exact: true,
  });
  assert.equal(await build.isEnabled(), false);
  await page.getByLabel("Your direction").fill(
    "Preserve the limited review sample and state Instagram remains unverified. No prices.",
  );
  await page.getByRole("checkbox").check();
  await build.click();
  await page.getByRole("button", {
    name: /ACA Landscaping · Assessment · Draft/,
  }).click();
  assert.equal(
    await page.getByRole("button", {
      name: "Approve customer document",
      exact: true,
    }).isEnabled(),
    false,
  );
  await fs.mkdir("output/customer-documents", { recursive: true });
  for (const [label, ext] of [["Word", "docx"], ["PDF", "pdf"]]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", {
      name: `Download customer ${label}`,
      exact: true,
    }).click();
    const file = await pending;
    assert.equal(await file.failure(), null);
    await file.saveAs(
      `output/customer-documents/ACA_Customer_Assessment_Draft.${ext}`,
    );
  }
  await page.screenshot({
    path: "output/customer-documents/customer-document-desktop.png",
    fullPage: true,
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", {
    name: "Approve customer document",
    exact: true,
  }).click();
  await page.getByRole("button", {
    name: /ACA Landscaping · Assessment · Approved/,
  }).click();
  await page.getByLabel("Our recommendation", { exact: true }).fill(
    "Updated reviewed recommendation for the customer.",
  );
  assert.equal(
    await page.getByRole("button", {
      name: "Download customer PDF",
      exact: true,
    }).isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "Save document edits", exact: true })
    .click();
  await page.getByRole("button", {
    name: /ACA Landscaping · Assessment · Draft/,
  }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1
    ),
  );
  await page.screenshot({
    path: "output/customer-documents/customer-document-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Customer flow passed: manual creation, approval, Word/PDF, edit reset, mobile width, no page errors.",
  );
} finally {
  await browser.close();
}
