-- Existing claims predate proposed-profile capture, so these columns remain
-- nullable for historical rows. New public registration always supplies them.
ALTER TABLE "StudentLinkClaim"
ADD COLUMN "proposedFullName" TEXT,
ADD COLUMN "proposedCompletedCreditHours" INTEGER,
ADD COLUMN "proposedIsTransferredThisYear" BOOLEAN;

ALTER TABLE "StudentLinkClaim"
ADD CONSTRAINT "StudentLinkClaim_proposed_full_name_canonical_check" CHECK (
  "proposedFullName" IS NULL
  OR (
    "proposedFullName" = btrim("proposedFullName")
    AND char_length("proposedFullName") BETWEEN 2 AND 120
  )
),
ADD CONSTRAINT "StudentLinkClaim_proposed_completed_credit_hours_nonnegative_check" CHECK (
  "proposedCompletedCreditHours" IS NULL
  OR "proposedCompletedCreditHours" >= 0
),
ADD CONSTRAINT "StudentLinkClaim_proposed_profile_completeness_check" CHECK (
  (
    "proposedFullName" IS NULL
    AND "proposedCompletedCreditHours" IS NULL
    AND "proposedIsTransferredThisYear" IS NULL
  )
  OR (
    "proposedFullName" IS NOT NULL
    AND "proposedCompletedCreditHours" IS NOT NULL
    AND "proposedIsTransferredThisYear" IS NOT NULL
  )
);
