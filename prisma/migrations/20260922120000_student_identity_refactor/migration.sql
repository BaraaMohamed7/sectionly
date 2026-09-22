-- Reject legacy academic rows that cannot be assigned to a Student safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CourseEnrollment" enrollment
    JOIN "User" account ON account.id = enrollment."studentId"
    WHERE account.role <> 'STUDENT'
  ) THEN
    RAISE EXCEPTION 'Cannot migrate CourseEnrollment rows owned by non-STUDENT users';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE role <> 'STUDENT'
      AND (
        "universityId" IS NOT NULL
        OR "completedCreditHours" IS NOT NULL
        OR "isTransferredThisYear" IS NOT NULL
        OR "onboardingCompletedAt" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Cannot migrate academic fields stored on non-STUDENT users';
  END IF;
END $$;

-- Separate authentication accounts from academic student identity.
CREATE TYPE "StudentLinkClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User" ADD COLUMN "adminName" TEXT;

UPDATE "User"
SET "adminName" = btrim(
  regexp_replace("fullName", '^dr(\.[[:space:]]*|[[:space:]]+)', '', 'i')
)
WHERE role IN ('ADMIN', 'SUPER_ADMIN');

CREATE TABLE "Student" (
  "id" UUID NOT NULL,
  "universityId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "completedCreditHours" INTEGER,
  "isTransferredThisYear" BOOLEAN,
  "userId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "Student_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Student_completed_credit_hours_nonnegative_check" CHECK (
    "completedCreditHours" IS NULL OR "completedCreditHours" >= 0
  ),
  CONSTRAINT "Student_university_id_canonical_check" CHECK (
    "universityId" = btrim("universityId")
    AND char_length("universityId") BETWEEN 1 AND 64
  ),
  CONSTRAINT "Student_full_name_canonical_check" CHECK (
    "fullName" = btrim("fullName")
    AND char_length("fullName") BETWEEN 2 AND 120
  )
);

INSERT INTO "Student" (
  "id",
  "universityId",
  "fullName",
  "completedCreditHours",
  "isTransferredThisYear",
  "userId",
  "createdAt",
  "updatedAt"
)
SELECT
  id,
  "universityId",
  "fullName",
  "completedCreditHours",
  "isTransferredThisYear",
  id,
  "createdAt",
  "updatedAt"
FROM "User"
WHERE role = 'STUDENT';

CREATE UNIQUE INDEX "Student_universityId_key" ON "Student"("universityId");
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

ALTER TABLE "Student"
ADD CONSTRAINT "Student_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing Student IDs intentionally equal legacy User IDs, preserving every
-- enrollment and registration key while retargeting the academic foreign key.
ALTER TABLE "CourseEnrollment" DROP CONSTRAINT "CourseEnrollment_studentId_fkey";
ALTER TABLE "CourseEnrollment"
ADD CONSTRAINT "CourseEnrollment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StudentLinkClaim" (
  "id" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "StudentLinkClaimStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),

  CONSTRAINT "StudentLinkClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentLinkClaim_resolution_check" CHECK (
    (status = 'PENDING' AND "resolvedAt" IS NULL AND "resolvedById" IS NULL)
    OR (status <> 'PENDING' AND "resolvedAt" IS NOT NULL AND "resolvedById" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "StudentLinkClaim_studentId_userId_key"
ON "StudentLinkClaim"("studentId", "userId");
CREATE INDEX "StudentLinkClaim_status_createdAt_idx"
ON "StudentLinkClaim"("status", "createdAt");
CREATE UNIQUE INDEX "StudentLinkClaim_one_pending_per_student_key"
ON "StudentLinkClaim"("studentId") WHERE status = 'PENDING';
CREATE UNIQUE INDEX "StudentLinkClaim_one_pending_per_user_key"
ON "StudentLinkClaim"("userId") WHERE status = 'PENDING';

ALTER TABLE "StudentLinkClaim"
ADD CONSTRAINT "StudentLinkClaim_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentLinkClaim"
ADD CONSTRAINT "StudentLinkClaim_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentLinkClaim"
ADD CONSTRAINT "StudentLinkClaim_resolvedById_fkey"
FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" DROP CONSTRAINT "User_student_fields_required_check";
ALTER TABLE "User" DROP CONSTRAINT "User_completed_credit_hours_nonnegative_check";
DROP INDEX "User_universityId_key";

ALTER TABLE "User"
DROP COLUMN "fullName",
DROP COLUMN "universityId",
DROP COLUMN "completedCreditHours",
DROP COLUMN "isTransferredThisYear",
DROP COLUMN "onboardingCompletedAt";

ALTER TABLE "User"
ADD CONSTRAINT "User_role_name_check" CHECK (
  (role = 'STUDENT' AND "adminName" IS NULL)
  OR (
    role IN ('ADMIN', 'SUPER_ADMIN')
    AND "adminName" IS NOT NULL
    AND "adminName" = btrim("adminName")
    AND char_length("adminName") BETWEEN 2 AND 120
    AND "adminName" !~* '^dr(\.[[:space:]]*|[[:space:]]+)'
  )
);
