import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const hash = createHash("sha256");
hash.update(`${process.platform}:${process.arch}:${process.versions.modules}`);
const add = async (path) => {
  hash.update(path);
  hash.update(await readFile(path));
};
await add("package-lock.json");
if (process.argv[2] === "build") {
  const walk = async (dir) => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) await add(path);
    }
  };
  for (const dir of ["src", "prisma", "scripts"]) await walk(dir);
  for (const path of [
    "package.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
  ])
    await add(path);
}
console.log(hash.digest("hex"));
