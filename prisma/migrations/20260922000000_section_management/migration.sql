-- Add required section location without breaking existing rows.
ALTER TABLE "Section" ADD COLUMN "location" TEXT;
UPDATE "Section" SET "location" = 'TBD' WHERE "location" IS NULL;
ALTER TABLE "Section" ALTER COLUMN "location" SET NOT NULL;

-- Record when each independently paused course window entered its pause state.
ALTER TABLE "Course"
ADD COLUMN "registrationPausedAt" TIMESTAMPTZ(3),
ADD COLUMN "switchingPausedAt" TIMESTAMPTZ(3);

UPDATE "Course"
SET "registrationPausedAt" = CURRENT_TIMESTAMP
WHERE "registrationPaused" = true;

UPDATE "Course"
SET "switchingPausedAt" = CURRENT_TIMESTAMP
WHERE "switchingPaused" = true;

ALTER TABLE "Section"
ADD CONSTRAINT "Section_location_canonical_check" CHECK (
  "location" = regexp_replace(btrim("location"), '[[:space:]]+', ' ', 'g')
  AND char_length("location") BETWEEN 1 AND 120
);

ALTER TABLE "Course"
ADD CONSTRAINT "Course_registration_pause_state_check" CHECK (
  ("registrationPaused" = false AND "registrationPausedAt" IS NULL)
  OR ("registrationPaused" = true AND "registrationPausedAt" IS NOT NULL)
),
ADD CONSTRAINT "Course_switching_pause_state_check" CHECK (
  ("switchingPaused" = false AND "switchingPausedAt" IS NULL)
  OR ("switchingPaused" = true AND "switchingPausedAt" IS NOT NULL)
);

CREATE INDEX "Section_responsibleAdminId_day_idx"
ON "Section"("responsibleAdminId", "day");

CREATE INDEX "Section_location_day_idx"
ON "Section"("location", "day");
