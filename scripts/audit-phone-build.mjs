import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
const root = "phone-dist";
let count = 0;
const walk = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["private", "originals", "node_modules"].includes(entry.name))
        throw new Error("Private or unsupported directory in public site");
      await walk(path);
    } else {
      if (
        ![
          ".js",
          ".mjs",
          ".css",
          ".html",
          ".png",
          ".svg",
          ".webmanifest",
          ".map",
        ].includes(extname(entry.name))
      )
        throw new Error(`Unexpected public asset: ${path}`);
      if ((await stat(path)).size > 12 * 1024 * 1024)
        throw new Error("Unexpected oversized public asset");
      count++;
    }
  }
};
await walk(root);
console.log(
  `Public phone build audited: ${count} app assets; no study archives, databases, or original books.`,
);
