-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('AR', 'EN');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COURSE_REMOVED_WITH_SECTION');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "courseId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "metadata" JSONB NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "creditHours" INTEGER NOT NULL,
    "registrationOpensAt" TIMESTAMPTZ(3),
    "registrationClosesAt" TIMESTAMPTZ(3),
    "switchingOpensAt" TIMESTAMPTZ(3),
    "switchingClosesAt" TIMESTAMPTZ(3),
    "registrationPaused" BOOLEAN NOT NULL DEFAULT false,
    "switchingPaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Course_code_canonical_check" CHECK ("code" = upper(btrim("code"))),
    CONSTRAINT "Course_credit_hours_positive_check" CHECK ("creditHours" > 0),
    CONSTRAINT "Course_registration_window_check" CHECK (
        ("registrationOpensAt" IS NULL AND "registrationClosesAt" IS NULL)
        OR (
            "registrationOpensAt" IS NOT NULL
            AND "registrationClosesAt" IS NOT NULL
            AND "registrationOpensAt" < "registrationClosesAt"
        )
    ),
    CONSTRAINT "Course_switching_window_check" CHECK (
        ("switchingOpensAt" IS NULL AND "switchingClosesAt" IS NULL)
        OR (
            "switchingOpensAt" IS NOT NULL
            AND "switchingClosesAt" IS NOT NULL
            AND "switchingOpensAt" < "switchingClosesAt"
        )
    )
);

-- CreateTable
CREATE TABLE "CourseAdmin" (
    "courseId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAdmin_pkey" PRIMARY KEY ("courseId","adminId")
);

-- CreateTable
CREATE TABLE "CourseEnrollment" (
    "studentId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("studentId","courseId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "universityId" TEXT,
    "completedCreditHours" INTEGER,
    "isTransferredThisYear" BOOLEAN,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_email_canonical_check" CHECK ("email" = lower(btrim("email"))),
    CONSTRAINT "User_completed_credit_hours_nonnegative_check" CHECK (
        "completedCreditHours" IS NULL OR "completedCreditHours" >= 0
    ),
    CONSTRAINT "User_student_fields_required_check" CHECK (
        "role" <> 'STUDENT'
        OR (
            "universityId" IS NOT NULL
            AND "completedCreditHours" IS NOT NULL
            AND "isTransferredThisYear" IS NOT NULL
        )
    )
);

-- CreateTable
CREATE TABLE "Section" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "sectionNumber" INTEGER NOT NULL,
    "responsibleAdminId" UUID NOT NULL,
    "day" "DayOfWeek" NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Section_number_positive_check" CHECK ("sectionNumber" > 0),
    CONSTRAINT "Section_capacity_positive_check" CHECK ("capacity" > 0),
    CONSTRAINT "Section_time_range_check" CHECK (
        "startMinute" >= 480
        AND "startMinute" < "endMinute"
        AND "endMinute" <= 1200
    )
);

-- CreateTable
CREATE TABLE "SectionRegistration" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SectionRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_courseId_createdAt_idx" ON "AuditLog"("courseId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Announcement_courseId_createdAt_idx" ON "Announcement"("courseId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminNotification_recipientId_readAt_createdAt_idx" ON "AdminNotification"("recipientId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE INDEX "CourseAdmin_adminId_courseId_idx" ON "CourseAdmin"("adminId", "courseId");

-- Only one assignment per course may carry the optional primary designation.
CREATE UNIQUE INDEX "CourseAdmin_one_primary_per_course_key"
ON "CourseAdmin"("courseId")
WHERE "isPrimary" = true;

-- CreateIndex
CREATE INDEX "CourseEnrollment_courseId_studentId_idx" ON "CourseEnrollment"("courseId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_universityId_key" ON "User"("universityId");

-- CreateIndex
CREATE INDEX "Section_courseId_isPublished_idx" ON "Section"("courseId", "isPublished");

-- CreateIndex
CREATE INDEX "Section_courseId_responsibleAdminId_idx" ON "Section"("courseId", "responsibleAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_courseId_sectionNumber_key" ON "Section"("courseId", "sectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Section_id_courseId_key" ON "Section"("id", "courseId");

-- CreateIndex
CREATE INDEX "SectionRegistration_sectionId_idx" ON "SectionRegistration"("sectionId");

-- CreateIndex
CREATE INDEX "SectionRegistration_courseId_studentId_idx" ON "SectionRegistration"("courseId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionRegistration_studentId_courseId_key" ON "SectionRegistration"("studentId", "courseId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotification" ADD CONSTRAINT "AdminNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotification" ADD CONSTRAINT "AdminNotification_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAdmin" ADD CONSTRAINT "CourseAdmin_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAdmin" ADD CONSTRAINT "CourseAdmin_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_courseId_responsibleAdminId_fkey" FOREIGN KEY ("courseId", "responsibleAdminId") REFERENCES "CourseAdmin"("courseId", "adminId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionRegistration" ADD CONSTRAINT "SectionRegistration_studentId_courseId_fkey" FOREIGN KEY ("studentId", "courseId") REFERENCES "CourseEnrollment"("studentId", "courseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionRegistration" ADD CONSTRAINT "SectionRegistration_sectionId_courseId_fkey" FOREIGN KEY ("sectionId", "courseId") REFERENCES "Section"("id", "courseId") ON DELETE RESTRICT ON UPDATE CASCADE;
