import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Locale, UserRole } from "@/generated/prisma/client";
import { requireStudent } from "@/server/authorization";
import { db } from "@/server/db";
import { completeStudentOnboarding } from "@/server/student-courses/service";
import { addCourseAction } from "@/app/student-course-actions";

vi.mock("@/server/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/authorization")>()),
  requireStudent: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockedRequireStudent = vi.mocked(requireStudent);

beforeEach(() => {
  mockedRequireStudent.mockReset();
});

describe("student course action boundary", () => {
  it("ignores a client-supplied studentId and mutates only the session student", async () => {
    const sessionStudent = await createOnboardedStudent();
    const otherStudent = await createOnboardedStudent();
    const course = await createCourse();
    mockedRequireStudent.mockResolvedValue({
      id: sessionStudent.id,
      fullName: sessionStudent.fullName,
      email: sessionStudent.email,
      role: UserRole.STUDENT,
      universityId: sessionStudent.universityId!,
      completedCreditHours: sessionStudent.completedCreditHours!,
      isTransferredThisYear: sessionStudent.isTransferredThisYear!,
      locale: Locale.EN,
      isActive: true,
      mustChangePassword: false,
      onboardingCompletedAt: sessionStudent.onboardingCompletedAt,
    });
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.set("studentId", otherStudent.id);

    await expect(
      addCourseAction({ status: "idle" }, formData),
    ).resolves.toMatchObject({ status: "success" });
    await expect(
      db.courseEnrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: sessionStudent.id,
            courseId: course.id,
          },
        },
      }),
    ).resolves.not.toBeNull();
    await expect(
      db.courseEnrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: otherStudent.id,
            courseId: course.id,
          },
        },
      }),
    ).resolves.toBeNull();
  });
});

async function createOnboardedStudent() {
  const suffix = randomUUID();
  const student = await db.user.create({
    data: {
      fullName: "Action Boundary Student",
      email: `action-student-${suffix}@example.com`,
      passwordHash:
        "$2b$12$o.suRJmHqKH.vPofp/RnT.pcvzQVYKsZ3CvXutZ9wXcF7dqBPIpEm",
      role: UserRole.STUDENT,
      universityId: `ACTION-${suffix}`,
      completedCreditHours: 10,
      isTransferredThisYear: false,
    },
  });
  await completeStudentOnboarding(student.id, []);
  return db.user.findUniqueOrThrow({ where: { id: student.id } });
}

async function createCourse() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return db.course.create({
    data: {
      code: `AC${suffix}`,
      nameAr: "مقرر اختبار الإجراء",
      nameEn: "Action Boundary Course",
      creditHours: 3,
    },
  });
}
