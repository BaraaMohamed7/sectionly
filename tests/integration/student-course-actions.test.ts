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
      email: sessionStudent.email,
      adminName: null,
      role: UserRole.STUDENT,
      locale: Locale.EN,
      isActive: true,
      mustChangePassword: false,
      student: {
        ...sessionStudent.student,
        completedCreditHours: sessionStudent.student.completedCreditHours!,
        isTransferredThisYear: sessionStudent.student.isTransferredThisYear!,
      },
      requestedStudentLinks: [],
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
            studentId: sessionStudent.student.id,
            courseId: course.id,
          },
        },
      }),
    ).resolves.not.toBeNull();
    await expect(
      db.courseEnrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: otherStudent.student.id,
            courseId: course.id,
          },
        },
      }),
    ).resolves.toBeNull();
  });
});

async function createOnboardedStudent() {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: {
      email: `action-student-${suffix}@example.com`,
      passwordHash:
        "$2b$12$o.suRJmHqKH.vPofp/RnT.pcvzQVYKsZ3CvXutZ9wXcF7dqBPIpEm",
      role: UserRole.STUDENT,
    },
  });
  const student = await db.student.create({
    data: {
      userId: user.id,
      fullName: "Action Boundary Student",
      universityId: `ACTION-${suffix}`,
      completedCreditHours: 10,
      isTransferredThisYear: false,
    },
  });
  await completeStudentOnboarding(user.id, []);
  return { ...user, student };
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
