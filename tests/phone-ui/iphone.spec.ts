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
  await nav(page, "Constitutional Law");
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
  await nav(page, "Constitutional Law");
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
  await nav(page, "Business Organizations");
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
  await nav(page, "Business Organizations");
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
  await nav(page, "Business Organizations");
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
  await nav(page, "Business Organizations");
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
  await nav(page, "Business Organizations");
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
  await nav(page, "Business Organizations");
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

test("detailed readings and real briefs are visible without class codes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(
    /CL(?:650|685|700)/,
  );
  await nav(page, "Constitutional Law");
  await page
    .getByRole("button", { name: /Federal Jurisdiction and Judicial Review/ })
    .click();
  await page
    .getByRole("button", { name: "Assigned Readings", exact: true })
    .click();
  await expect(page.getByText(/Marbury v. Madison, 5 U.S. 137/)).toBeVisible();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Detailed reading notes/ }),
  ).toBeVisible();
  await expect(
    page.getByText(/Federal judicial power must fit an Article III category/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cases", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Marbury v. Madison", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/The writ was denied for lack of original jurisdiction/),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(
    /CL(?:650|685|700)/,
  );
});

test("legacy saved labels use course names without rewriting stored notes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.casebookTransport!("item", {
      kind: "note",
      moduleId: "CL700-M01",
      title: "CL700 legacy notes",
      body: "CL 700 and cl-685 study labels",
      fields: { kind: "notes" },
    }),
  );
  await page.reload();
  await nav(page, "Business Organizations");
  await page
    .getByRole("button", { name: /Non-Corporate Entities/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Business Organizations legacy notes",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Business Organizations and Criminal Procedure study labels",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(
    /\bCL[ -]?\d{3}\b/i,
  );
  const raw = await page.evaluate(() => window.casebookTransport!("export"));
  expect(
    raw.data.note.find((n: any) => n.title === "CL700 legacy notes").body,
  ).toBe("CL 700 and cl-685 study labels");
});

test("optional readings and authored application questions are available without an AI key", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await nav(page, "Constitutional Law");
  await page.getByRole("button", { name: /Justiciability: Standing/ }).click();
  await page
    .getByRole("button", { name: "Optional Readings", exact: true })
    .click();
  await expect(page.getByText(/Elk Grove Unified School Dist/)).toBeVisible();
  await page.getByRole("button", { name: "Cases", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Murthy v. Missouri", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Optional reading", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mini Module Exam", exact: true })
    .click();
  await expect(
    page
      .getByText(
        /A previously injured plaintiff seeks damages and an injunction/,
      )
      .last(),
  ).toBeVisible();
  const raw = await page.evaluate(() => window.casebookTransport!("export"));
  const qs = raw.data.flashcard.filter(
    (q: any) =>
      q.id.includes("-exam-") ||
      q.id.startsWith("optional-exam-") ||
      q.id.includes("-application-"),
  );
  expect(qs).toHaveLength(100);
  expect(
    qs.every(
      (q: any) => q.answer && q.excerptId && q.status === "needs_review",
    ),
  ).toBe(true);
});

test("Casebook shows the uploaded definitions and substantive notes in every module", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Casebook");
  await nav(page, "Criminal Procedure");
  await page.getByRole("button", { name: /Exclusionary Rule/ }).click();
  await page.getByRole("button", { name: "Definitions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Custodial interrogation", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText(/Custody and interrogation are distinct requirements/)
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Protective sweep", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const data = await page.evaluate(() => window.casebookTransport!("state"));
  const modules = data.courses.flatMap((c: any) => c.modules);
  expect(modules).toHaveLength(45);
  expect(
    modules.every((m: any) =>
      m.notes.some((n: any) => n.kind === "Detailed reading notes"),
    ),
  ).toBe(true);
  await nav(page, "Constitutional Law");
  await page.getByRole("button", { name: /Justiciability: Timing/ }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Detailed reading notes — Justiciability: Timing",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Why Poe was dismissed/)).toBeVisible();
  await page
    .getByText("Primary opinion sources and scope", { exact: true })
    .first()
    .click();
  await expect(page.getByRole("link", { name: /Poe v. Ullman/ })).toBeVisible();
});
