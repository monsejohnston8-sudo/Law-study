import { test, expect } from "@playwright/test";
async function nav(page: any, name: string) {
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
test("install assets, on-device notes, and offline reload without server APIs", async ({
  page,
  context,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/") || r.method() === "POST")
      apiRequests.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(2);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await nav(page, "CL650 Constitutional Law");
  await page
    .getByRole("button", { name: /Overview of the Constitution/ })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Title / question").fill("Offline iPhone note");
  await page
    .getByLabel("Content / summary")
    .fill("Stored on this device without a server.");
  await page.getByRole("button", { name: "Confirm & save item" }).click();
  await expect(
    page.getByRole("heading", { name: "Offline iPhone note" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await nav(page, "CL650 Constitutional Law");
  await page
    .getByRole("button", { name: /Overview of the Constitution/ })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByText("Stored on this device without a server."),
  ).toBeVisible();
  expect(apiRequests).toHaveLength(0);
});
test("imports a private study package locally and reads source sections offline", async ({
  page,
  context,
}) => {
  const outbound: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" || r.url().includes("/api/"))
      outbound.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await nav(page, "Settings & backup");
  await page
    .getByLabel("Private study package", { exact: true })
    .setInputFiles(
      process.env.CASEBOOK_PRIVATE_STUDY_PACKAGE || "private/phone-fixture.zip",
    );
  await page
    .getByLabel("Type IMPORT to replace the local collection")
    .fill("IMPORT");
  await page
    .getByRole("button", { name: "Import study package", exact: true })
    .click();
  await expect(
    page.getByText(
      `Imported 3 courses, 45 modules and ${process.env.CASEBOOK_PRIVATE_STUDY_PACKAGE ? 12 : 1} private sources.`,
    ),
  ).toBeVisible({ timeout: 60000 });
  await nav(page, "Import sources");
  const title = process.env.CASEBOOK_PRIVATE_STUDY_PACKAGE
    ? "Business Organizations Law"
    : "Original phone fixture";
  const reader = page
    .locator("details")
    .filter({ has: page.getByText(title, { exact: true }) });
  await reader.locator("summary").click();
  await expect(
    reader.getByRole("heading", { name: /EPUB spine/ }),
  ).toBeVisible();
  expect(
    (await reader.locator(".excerpt .preserve").innerText()).length,
  ).toBeGreaterThan(40);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const expectedSection = await reader
    .locator("select")
    .first()
    .locator("option")
    .nth(1)
    .innerText();
  await context.setOffline(true);
  await reader
    .getByRole("combobox", { name: "Extracted page / section", exact: true })
    .selectOption("1");
  await expect(
    reader.getByRole("heading", { name: expectedSection, exact: true }),
  ).toBeVisible();
  await nav(page, "Settings & backup");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export study package with original books",
      exact: true,
    })
    .click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe("Casebook-iPhone-Study-Data.zip");
  expect(await downloaded.failure()).toBeNull();
  expect(outbound).toHaveLength(0);
});
