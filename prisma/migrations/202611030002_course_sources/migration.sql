-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "edition" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rights" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Source_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Source_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Source" ("courseId", "author", "createdAt", "edition", "filename", "hash", "id", "mime", "moduleId", "rights", "status", "title", "type", "updatedAt") SELECT (SELECT "courseId" FROM "Module" WHERE "Module"."id" = "Source"."moduleId"), "author", "createdAt", "edition", "filename", "hash", "id", "mime", "moduleId", "rights", "status", "title", "type", "updatedAt" FROM "Source";
DROP TABLE "Source";
ALTER TABLE "new_Source" RENAME TO "Source";
CREATE UNIQUE INDEX "Source_hash_key" ON "Source"("hash");
CREATE TABLE "new_SourceExcerpt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "locatorVerified" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceExcerpt_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SourceExcerpt" ("createdAt", "id", "page", "section", "sourceId", "text", "updatedAt") SELECT "createdAt", "id", "page", "section", "sourceId", "text", "updatedAt" FROM "SourceExcerpt";
DROP TABLE "SourceExcerpt";
ALTER TABLE "new_SourceExcerpt" RENAME TO "SourceExcerpt";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
