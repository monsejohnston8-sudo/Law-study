import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.CASEBOOK_BUILD_DIR || ".next",
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
    "pdfjs-dist",
  ],
  agentRules: false,
};
export default config;
