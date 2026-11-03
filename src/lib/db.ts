import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync(resolve("private"), { recursive: true, mode: 0o700 });
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./private/study.db",
});
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") g.prisma = db;
