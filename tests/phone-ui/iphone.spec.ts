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
  await page.getByLabel("Add study materials and keep my progress").uncheck();
  await page
    .getByLabel("Type IMPORT to replace the local collection")
    .fill("IMPORT");
  await page
    .getByRole("button", { name: "Import study package", exact: true })
    .click();
  await expect(
    page.getByText(
      `Imported 3 courses, 45 modules and ${process.env.CASEBOOK_PRIVATE_STUDY_PACKAGE ? 12 : 4} private sources.`,
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
  const spineOption = reader
    .locator("option")
    .filter({ hasText: /EPUB spine/ })
    .first();
  await reader
    .getByRole("combobox", { name: "Extracted page / section", exact: true })
    .selectOption((await spineOption.getAttribute("value")) as string);
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

test("mini exam saves answers, reveals explanations only after submission, and survives a materials update", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const api = window.casebookTransport!;
    const form = new FormData();
    for (const [k, v] of Object.entries({
      courseId: "CL700",
      moduleId: "CL700-M01",
      title: "Exam fixture source",
      author: "Test",
      edition: "",
      type: "notes",
      rights: "Original fixture",
    }))
      form.set(k, v);
    form.set(
      "file",
      new File(["Original fixture: alpha precedes beta."], "exam.txt", {
        type: "text/plain",
      }),
    );
    await api("import", form);
    const state = await api("state");
    const source = state.courses
      .find((c: any) => c.id === "CL700")
      .sources.find((s: any) => s.title === "Exam fixture source");
    await api("item", {
      kind: "flashcard",
      moduleId: "CL700-M01",
      title: "What precedes beta?",
      status: "needs_review",
      origin: "AI-generated draft",
      excerptId: source.excerpts[0].id,
      fields: { answer: "Alpha precedes beta." },
    });
  });
  await page.reload();
  await nav(page, "CL700 Corporations Business Organizations");
  await page
    .getByRole("button", { name: /Non-Corporate Entities/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Mini Module Exam", exact: true })
    .click();
  await expect(
    page.getByText("Alpha precedes beta.", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Exam answer 1").fill("Alpha");
  await page
    .getByRole("button", { name: "Save exam draft", exact: true })
    .click();
  await expect(
    page.getByText("Exam draft saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await nav(page, "CL700 Corporations Business Organizations");
  await page
    .getByRole("button", { name: /Non-Corporate Entities/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Mini Module Exam", exact: true })
    .click();
  await expect(page.getByLabel("Exam answer 1")).toHaveValue("Alpha");
  await page
    .getByRole("button", { name: "Submit mini exam", exact: true })
    .click();
  await expect(
    page.getByText("Alpha precedes beta.", { exact: true }),
  ).toBeVisible();
  await nav(page, "Settings & backup");
  await page
    .getByLabel("Private study package", { exact: true })
    .setInputFiles("private/phone-fixture.zip");
  await page
    .getByRole("button", { name: "Add study materials", exact: true })
    .click();
  await expect(
    page.getByText(/Your existing work and progress were kept/),
  ).toBeVisible();
  await nav(page, "CL700 Corporations Business Organizations");
  await page
    .getByRole("button", { name: /Non-Corporate Entities/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Mini Module Exam", exact: true })
    .click();
  await expect(page.getByLabel("Exam answer 1")).toHaveValue("Alpha");
  await expect(
    page.getByText("Alpha precedes beta.", { exact: true }),
  ).toBeVisible();
});

test("shared notes are automatic; personal upload AI stays private and feeds its module exam", async ({
  page,
  context,
}) => {
  let calls = 0;
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    const input = JSON.parse(body.input);
    const citation = {
      excerptId: input.source.id,
      support: "Alpha precedes beta.",
    };
    expect(input.source.text).toContain("Alpha precedes beta.");
    expect(body.store).toBe(false);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  title: "Personal sequence notes",
                  summary:
                    "This private fixture covers the ordering of symbols.",
                  notes: [
                    {
                      heading: "Sequence",
                      explanation:
                        "Alpha comes before beta in the supplied fixture.",
                      citation,
                    },
                  ],
                  questions: [
                    {
                      question: "According to my upload, what precedes beta?",
                      answer: "Alpha.",
                      explanation: "The uploaded passage gives this order.",
                      citation,
                    },
                  ],
                  limitations: ["Original nonlegal test content."],
                }),
              },
            ],
          },
        ],
      }),
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await nav(page, "CL700 Corporations Business Organizations");
  await page
    .getByRole("button", { name: /Non-Corporate Entities/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Recognizing a general partnership",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mini Module Exam", exact: true })
    .click();
  await expect(page.getByLabel("Exam answer 1")).toBeVisible();
  await nav(page, "Import sources");
  const form = page.locator("form.import-form");
  await form.locator('input[name="file"]').setInputFiles({
    name: "private-original-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Original private test material. Alpha precedes beta. Gamma follows beta.",
    ),
  });
  await form.locator('input[name="title"]').fill("My private sequence reading");
  await form.locator('select[name="courseId"]').selectOption("CL700");
  await form.locator('select[name="moduleId"]').selectOption("CL700-M01");
  await form.locator('input[name="rights"]').fill("Original test material");
  await form.locator('input[name="generateAI"]').check();
  await form
    .getByRole("button", { name: "Upload & inspect extraction" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "AI study notes and mini exam",
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("OpenAI API key", { exact: true })
    .fill("sk-original-browser-test-key");
  await dialog
    .getByRole("button", { name: "Connect OpenAI", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Generate study draft", exact: true }),
  ).toBeDisabled();
  expect(calls).toBe(0);
  await dialog
    .getByRole("combobox", { name: "Study format", exact: true })
    .selectOption("depth");
  await dialog
    .getByLabel(
      "Send this displayed passage to OpenAI to generate my study draft.",
    )
    .check();
  await dialog
    .getByRole("button", { name: "Generate study draft", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Personal sequence notes",
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect(
    await page.evaluate(async () => {
      const data = await window.casebookTransport!("export");
      return data.data.note.filter((n: any) => n.id.startsWith("personal-ai-"))
        .length;
    }),
  ).toBe(0);
  await dialog
    .getByRole("button", {
      name: "Confirm & add notes and exam questions",
      exact: true,
    })
    .click();
  await expect(dialog.getByText(/Added 1 note and 1 questions/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await nav(page, "CL700 Corporations Business Organizations");
  await page
    .getByRole("button", { name: /Non-Corporate Entities/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Mini Module Exam", exact: true })
    .click();
  await expect(
    page.getByText("1. According to my upload, what precedes beta?", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Exam answer 1").fill("Alpha");
  await page
    .getByRole("button", { name: "Submit mini exam", exact: true })
    .click();
  await expect(page.getByText("Alpha.", { exact: true })).toBeVisible();
  await page.reload();
  await nav(page, "CL700 Corporations Business Organizations");
  await page
    .getByRole("button", { name: /Non-Corporate Entities/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Mini Module Exam", exact: true })
    .click();
  await expect(page.getByLabel("Exam answer 1")).toHaveValue("Alpha");
  const data = await page.evaluate(() => window.casebookTransport!("export"));
  expect(JSON.stringify(data)).not.toContain("sk-original-browser-test-key");
  const other = await context.browser()!.newContext();
  try {
    const visitor = await other.newPage();
    await visitor.goto("http://127.0.0.1:3200/");
    await expect(
      visitor.getByRole("heading", { name: "A little progress. Every day." }),
    ).toBeVisible();
    const otherData = await visitor.evaluate(() =>
      window.casebookTransport!("export"),
    );
    expect(
      otherData.data.note.filter((n: any) => n.id.startsWith("personal-ai-")),
    ).toHaveLength(0);
    expect(
      otherData.data.note.filter((n: any) => n.origin === "Shared study draft"),
    ).toHaveLength(53);
  } finally {
    await other.close();
  }
});
