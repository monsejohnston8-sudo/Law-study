import "fake-indexeddb/auto";
import { createPhoneStore, phoneApi } from "../mobile/store";
import { exportStudyPackage } from "../mobile/package";
import { zipSync, strToU8 } from "fflate";
import { mkdir, writeFile } from "node:fs/promises";
const db = createPhoneStore(`fixture-${crypto.randomUUID()}`);
try {
  const api = phoneApi(db);
  await api("state");
  const bytes = zipSync({
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    ),
    "OPS/book.opf": strToU8(
      '<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
    ),
    "OPS/a.xhtml": strToU8(
      "<html><body><h1>Original phone fixture</h1><p>This is original nonlegal test content used to verify private on-device reading and persistence.</p></body></html>",
    ),
    "OPS/b.xhtml": strToU8(
      "<html><body><h1>Second section</h1><p>This second section verifies switching source sections while completely offline.</p></body></html>",
    ),
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    courseId: "CL700",
    moduleId: "",
    title: "Original phone fixture",
    author: "Test fixture",
    edition: "",
    type: "notes",
    rights: "Original test material",
  }))
    form.set(key, value);
  form.set(
    "file",
    new File([new Uint8Array(bytes)], "fixture.epub", {
      type: "application/epub+zip",
    }),
  );
  await api("import", form);
  const blob = await exportStudyPackage(db);
  await mkdir("private", { recursive: true });
  await writeFile(
    "private/phone-fixture.zip",
    new Uint8Array(await blob.arrayBuffer()),
  );
  console.log("Created original, nonlegal phone test package");
} finally {
  await db.delete();
}
