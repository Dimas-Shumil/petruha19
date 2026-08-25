ALTER TABLE "Work" ADD COLUMN "seoTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Work" ADD COLUMN "seoDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Work" ADD COLUMN "showOnHome" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Work_isPublished_showOnHome_sortOrder_idx"
ON "Work"("isPublished", "showOnHome", "sortOrder");
