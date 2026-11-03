import { resolve, join } from "node:path";
// Tests can isolate original binaries as well as the SQLite database.
export const dataDirectory = resolve(
  process.env.CASEBOOK_DATA_DIR ?? "private",
);
export const originalsDirectory = join(dataDirectory, "originals");
