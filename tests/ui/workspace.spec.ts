import { test, expect } from "@playwright/test";
test("dashboard, curriculum, persistent note, source import, and graded quiz", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /CL650/ }).first().click();
  await expect(
    page.getByRole("button", { name: /Content incomplete/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Overview of the Constitution/ })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Title / question").fill("UI persistence check");
  await page.getByLabel("Content / summary").fill("User-written test note");
  await page.getByRole("button", { name: "Confirm & save item" }).click();
  await expect(
    page.getByRole("heading", { name: "UI persistence check" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /CL650/ }).first().click();
  await page
    .getByRole("button", { name: /Overview of the Constitution/ })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByText("User-written test note")).toBeVisible();
  await page
    .getByRole("button", { name: "Import sources", exact: true })
    .click();
  await page.getByLabel("File", { exact: true }).setInputFiles({
    name: "smoke-source.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      `Source fixture ${Date.now()}: notes for private study.`,
    ),
  });
  await page.getByLabel("Title", { exact: true }).fill("Smoke source");
  await page
    .getByRole("combobox", { name: "Course", exact: true })
    .selectOption("CL650");
  await page.getByLabel("Course / module").selectOption("CL650-M01");
  await page
    .getByLabel("Rights / permission to use")
    .fill("My original test fixture");
  await page
    .getByRole("button", { name: "Upload & inspect extraction" })
    .click();
  await expect(
    page.getByText(
      "Imported. Inspect the extraction below before creating study items.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /CL650/ }).first().click();
  await page
    .getByRole("button", { name: /Overview of the Constitution/ })
    .click();
  await page
    .getByRole("button", { name: "Practice Questions", exact: true })
    .click();
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page.getByLabel("Title / question").fill("Which letter follows A?");
  for (const [i, l] of ["A", "B", "C", "D"].entries()) {
    await page
      .getByLabel(`Option ${l}`, { exact: true })
      .fill(["B", "C", "D", "E"][i]);
    await page
      .getByLabel(`Explanation for ${l}`)
      .fill(
        i === 0 ? "B follows A." : "This letter does not immediately follow A.",
      );
  }
  await page
    .getByRole("combobox", { name: "Correct answer", exact: true })
    .selectOption("0");
  await page
    .getByRole("combobox", { name: "Review status", exact: true })
    .selectOption("verified");
  await page.getByRole("button", { name: "Confirm & save item" }).click();
  await page.getByRole("button", { name: "Start practice exam" }).click();
  await page.getByRole("button", { name: "Begin exam" }).click();
  await page.getByRole("radio").first().check();
  await expect(page.getByText("B follows A.")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(
    page.getByRole("heading", { name: "Correct", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("B follows A.")).toBeVisible();
});

test("verified flashcard scheduling, keyboard controls, and resumable IRAC draft", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /CL650/ }).first().click();
  await page
    .getByRole("button", { name: /Overview of the Constitution/ })
    .click();
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Title / question")
    .fill("Flashcard integration fixture");
  await page
    .getByLabel("Answer", { exact: true })
    .fill("An original user-written test answer.");
  await page
    .getByRole("combobox", { name: "Review status", exact: true })
    .selectOption("verified");
  await page.getByRole("button", { name: "Confirm & save item" }).click();
  await expect(
    page.getByRole("heading", { name: "Flashcard integration fixture" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Study verified cards" }).click();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("dialog").getByText("An original user-written test answer."),
  ).toBeVisible();
  await page.keyboard.press("3");
  await expect(
    page.getByRole("heading", { name: "Review complete" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const state = await (await page.request.get("/api/state")).json();
  const card = state.courses[0].modules[0].flashcards.find(
    (c: any) => c.title === "Flashcard integration fixture",
  );
  expect(card.repetitions).toBe(1);
  expect(new Date(card.due).getTime()).toBeGreaterThan(Date.now());
  await page.getByRole("button", { name: "IRAC Essays", exact: true }).click();
  await page.getByRole("button", { name: "New IRAC draft" }).click();
  await page.getByLabel("Essay title").fill("Autosaved integration essay");
  await page
    .getByLabel("Issue", { exact: true })
    .fill("My original issue analysis.");
  await page
    .getByRole("textbox", { name: "Application", exact: true })
    .fill("Applying the facts to the rule.");
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "All changes saved",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: /Autosaved integration essay/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /CL650/ }).first().click();
  await page
    .getByRole("button", { name: /Overview of the Constitution/ })
    .click();
  await page.getByRole("button", { name: "IRAC Essays", exact: true }).click();
  await page
    .getByRole("button", { name: /Autosaved integration essay/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Application", exact: true }),
  ).toHaveValue("Applying the facts to the rule.");
});

test("search empty state and mobile navigation remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little progress. Every day." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Search library" }).click();
  await page
    .getByRole("textbox", { name: "Search library" })
    .fill("no-such-topic-987654321");
  await expect(
    page.getByRole("heading", { name: "No matches yet" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-search.png",
    fullPage: true,
  });
});

test("editorial persistence, provenance safeguards, duplicate import, and backup restore", async ({
  request,
}) => {
  const rule = await request.post("/api/item", {
    data: {
      kind: "rule",
      moduleId: "CL650-M01",
      title: "Original rule fixture",
      status: "needs_review",
      body: "User text, not sourced law",
      fields: { jurisdiction: "Test context", elements: "Element fixture" },
    },
  });
  expect(rule.ok()).toBe(true);
  const saved = await rule.json();
  const loaded = await (
    await request.get(`/api/item?kind=rule&id=${saved.id}`)
  ).json();
  expect(loaded.elements).toBe("Element fixture");
  const brief = await request.post("/api/item", {
    data: {
      kind: "caseBrief",
      moduleId: "CL650-M01",
      title: "Original brief fixture",
      status: "needs_review",
      fields: { facts: "User facts", holding: "User holding, unverified" },
    },
  });
  expect(brief.ok()).toBe(true);
  const bytes = Buffer.from(
    "Original import fixture used to test provenance and duplicate detection.",
  );
  const fields = {
    courseId: "CL650",
    moduleId: "CL650-M01",
    title: "Provenance test source",
    type: "notes",
    rights: "Original fixture",
    file: { name: "provenance.txt", mimeType: "text/plain", buffer: bytes },
  };
  const source = await request.post("/api/import", { multipart: fields });
  expect(source.status()).toBe(201);
  const sourceId = (await source.json()).id;
  const duplicate = await request.post("/api/import", { multipart: fields });
  expect(duplicate.status()).toBe(409);
  const state = await (await request.get("/api/state")).json(),
    module = state.courses[0].modules[0],
    ex = state.courses[0].sources.find((s: any) => s.id === sourceId)
      .excerpts[0];
  for (const q of module.mcqs) {
    expect(q.correct).toBeUndefined();
    expect(q.explanations).toBeUndefined();
  }
  const unsafe = await request.post("/api/item", {
    data: {
      kind: "flashcard",
      moduleId: "CL650-M01",
      title: "Unverified source card",
      excerptId: ex.id,
      status: "verified",
      fields: { answer: "An original test answer" },
    },
  });
  expect(unsafe.status()).toBe(400);
  const verified = await request.post("/api/locator", {
    data: { id: ex.id, section: "Original fixture, opening paragraph" },
  });
  expect(verified.ok()).toBe(true);
  const forged = await request.post("/api/select-excerpt", {
    data: { id: ex.id, text: "This text was never in the source" },
  });
  expect(forged.status()).toBe(400);
  const selected = await request.post("/api/select-excerpt", {
    data: { id: ex.id, text: "Original import fixture" },
  });
  expect(selected.ok()).toBe(true);
  const passage = await selected.json();
  expect(passage.sourceId).toBe(sourceId);
  expect(passage.text).toBe("Original import fixture");
  expect(passage.locatorVerified).toBe(true);
  const backed = await (await request.get("/api/export")).json();
  const bad = await request.post("/api/restore", {
    data: { confirm: "NO", backup: backed },
  });
  expect(bad.status()).toBe(400);
  const restored = await request.post("/api/restore", {
    data: { confirm: "RESTORE", backup: backed },
  });
  expect(restored.ok()).toBe(true);
  const after = await (
    await request.get("/api/item?kind=rule&id=" + saved.id)
  ).json();
  expect(after.body).toBe("User text, not sourced law");
});
