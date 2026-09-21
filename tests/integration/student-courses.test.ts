import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DayOfWeek, UserRole } from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { createPrismaClient, db } from "@/server/db";
import { StudentCourseError } from "@/server/student-courses/errors";
import {
  addStudentCourse,
  completeStudentOnboarding,
  removeStudentCourse,
} from "@/server/student-courses/service";

const firstClient = createPrismaClient();
const secondClient = createPrismaClient();

afterAll(async () => {
  await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
});

describe("student course selection", () => {
  it("completes initial onboarding with valid authoritative courses", async () => {
    const student = await createStudent();
    const first = await createCourse(3);
    const second = await createCourse(4);

    const result = await completeStudentOnboarding(student.id, [
      first.id,
      second.id,
    ]);

    expect(result).toMatchObject({ courseCount: 2, totalCreditHours: 7 });
    await expect(enrollmentIds(student.id)).resolves.toEqual(
      [first.id, second.id].sort(),
    );
    await expect(onboardingCompletedAt(student.id)).resolves.toBeInstanceOf(
      Date,
    );
    await expect(
      auditActions(student.id, AUDIT_ACTIONS.STUDENT_ONBOARDING_COMPLETED),
    ).resolves.toHaveLength(1);
  });

  it("allows onboarding with zero courses", async () => {
    const student = await createStudent();

    await expect(
      completeStudentOnboarding(student.id, []),
    ).resolves.toMatchObject({
      courseCount: 0,
      totalCreditHours: 0,
    });
    await expect(enrollmentIds(student.id)).resolves.toEqual([]);
    await expect(onboardingCompletedAt(student.id)).resolves.toBeInstanceOf(
      Date,
    );
  });

  it("rejects more than 19 credit hours atomically", async () => {
    const student = await createStudent();
    const first = await createCourse(10);
    const second = await createCourse(10);

    await expect(
      completeStudentOnboarding(student.id, [first.id, second.id]),
    ).rejects.toMatchObject({
      code: "CREDIT_HOUR_LIMIT_EXCEEDED",
    } satisfies Partial<StudentCourseError>);
    await expect(enrollmentIds(student.id)).resolves.toEqual([]);
    await expect(onboardingCompletedAt(student.id)).resolves.toBeNull();
    await expect(
      auditActions(student.id, AUDIT_ACTIONS.STUDENT_ONBOARDING_COMPLETED),
    ).resolves.toEqual([]);
  });

  it("rejects an unknown course ID without partial enrollment", async () => {
    const student = await createStudent();
    const course = await createCourse(3);

    await expect(
      completeStudentOnboarding(student.id, [course.id, randomUUID()]),
    ).rejects.toMatchObject({
      code: "COURSE_NOT_FOUND",
    } satisfies Partial<StudentCourseError>);
    await expect(enrollmentIds(student.id)).resolves.toEqual([]);
    await expect(onboardingCompletedAt(student.id)).resolves.toBeNull();
  });

  it("deduplicates submitted IDs before totaling or inserting", async () => {
    const student = await createStudent();
    const course = await createCourse(10);

    await expect(
      completeStudentOnboarding(student.id, [
        course.id,
        course.id.toUpperCase(),
        ` ${course.id} `,
      ]),
    ).resolves.toMatchObject({ courseCount: 1, totalCreditHours: 10 });
    await expect(enrollmentIds(student.id)).resolves.toEqual([course.id]);
  });

  it("sets onboarding completion only after a successful confirmation", async () => {
    const student = await createStudent();
    const tooLarge = await createCourse(20);
    const valid = await createCourse(3);

    await expect(
      completeStudentOnboarding(student.id, [tooLarge.id]),
    ).rejects.toMatchObject({ code: "CREDIT_HOUR_LIMIT_EXCEEDED" });
    await expect(onboardingCompletedAt(student.id)).resolves.toBeNull();

    await completeStudentOnboarding(student.id, [valid.id]);
    await expect(onboardingCompletedAt(student.id)).resolves.toBeInstanceOf(
      Date,
    );
  });

  it("cannot confirm onboarding twice", async () => {
    const student = await createStudent();
    const course = await createCourse(3);
    await completeStudentOnboarding(student.id, []);

    await expect(
      completeStudentOnboarding(student.id, [course.id]),
    ).rejects.toMatchObject({
      code: "ONBOARDING_ALREADY_COMPLETED",
    } satisfies Partial<StudentCourseError>);
    await expect(enrollmentIds(student.id)).resolves.toEqual([]);
  });

  it("adds a course when the resulting total is at most 19", async () => {
    const student = await createStudent();
    const existing = await createCourse(16);
    const target = await createCourse(3);
    await completeStudentOnboarding(student.id, [existing.id]);

    await expect(
      addStudentCourse(student.id, target.id),
    ).resolves.toMatchObject({
      totalCreditHours: 19,
    });
    await expect(enrollmentIds(student.id)).resolves.toEqual(
      [existing.id, target.id].sort(),
    );
  });

  it("rejects an addition that would exceed 19 credit hours", async () => {
    const student = await createStudent();
    const existing = await createCourse(17);
    const target = await createCourse(3);
    await completeStudentOnboarding(student.id, [existing.id]);

    await expect(addStudentCourse(student.id, target.id)).rejects.toMatchObject(
      {
        code: "CREDIT_HOUR_LIMIT_EXCEEDED",
      } satisfies Partial<StudentCourseError>,
    );
    await expect(enrollmentIds(student.id)).resolves.toEqual([existing.id]);
    await expect(
      db.auditLog.findFirst({
        where: {
          actorId: student.id,
          courseId: target.id,
          action: AUDIT_ACTIONS.STUDENT_COURSE_ADDED,
        },
      }),
    ).resolves.toBeNull();
  });

  it("removes an enrollment without resetting onboarding", async () => {
    const student = await createStudent();
    const course = await createCourse(3);
    await completeStudentOnboarding(student.id, [course.id]);

    await removeStudentCourse(student.id, course.id);

    await expect(enrollmentIds(student.id)).resolves.toEqual([]);
    await expect(onboardingCompletedAt(student.id)).resolves.toBeInstanceOf(
      Date,
    );
    await expect(
      db.auditLog.findFirst({
        where: {
          actorId: student.id,
          courseId: course.id,
          action: AUDIT_ACTIONS.STUDENT_COURSE_REMOVED,
        },
      }),
    ).resolves.not.toBeNull();
  });

  it("fails safely instead of cascading a future section registration", async () => {
    const student = await createStudent();
    const course = await createCourse(3);
    const admin = await createAdmin();
    await completeStudentOnboarding(student.id, [course.id]);
    await db.courseAdmin.create({
      data: { courseId: course.id, adminId: admin.id },
    });
    const section = await db.section.create({
      data: {
        courseId: course.id,
        sectionNumber: 1,
        responsibleAdminId: admin.id,
        day: DayOfWeek.SATURDAY,
        startMinute: 480,
        endMinute: 540,
        capacity: 10,
      },
    });
    await db.sectionRegistration.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        sectionId: section.id,
      },
    });

    await expect(
      removeStudentCourse(student.id, course.id),
    ).rejects.toMatchObject({
      code: "COURSE_REMOVAL_BLOCKED",
    } satisfies Partial<StudentCourseError>);
    await expect(enrollmentIds(student.id)).resolves.toEqual([course.id]);
    await expect(
      db.auditLog.findFirst({
        where: {
          actorId: student.id,
          courseId: course.id,
          action: AUDIT_ACTIONS.STUDENT_COURSE_REMOVED,
        },
      }),
    ).resolves.toBeNull();
  });

  it("requires onboarding before add and remove operations", async () => {
    const student = await createStudent();
    const course = await createCourse(3);

    await expect(addStudentCourse(student.id, course.id)).rejects.toMatchObject(
      {
        code: "ONBOARDING_NOT_COMPLETED",
      } satisfies Partial<StudentCourseError>,
    );
    await expect(
      removeStudentCourse(student.id, course.id),
    ).rejects.toMatchObject({
      code: "ONBOARDING_NOT_COMPLETED",
    } satisfies Partial<StudentCourseError>);
  });

  it("returns friendly duplicate and missing enrollment errors", async () => {
    const student = await createStudent();
    const enrolled = await createCourse(3);
    const notEnrolled = await createCourse(3);
    await completeStudentOnboarding(student.id, [enrolled.id]);

    await expect(
      addStudentCourse(student.id, enrolled.id),
    ).rejects.toMatchObject({
      code: "ALREADY_ENROLLED",
    } satisfies Partial<StudentCourseError>);
    await expect(
      removeStudentCourse(student.id, notEnrolled.id),
    ).rejects.toMatchObject({
      code: "NOT_ENROLLED",
    } satisfies Partial<StudentCourseError>);
  });

  it("revalidates authorization from the locked database row", async () => {
    const student = await createStudent();
    const course = await createCourse(3);
    await completeStudentOnboarding(student.id, []);
    await db.user.update({
      where: { id: student.id },
      data: { role: UserRole.ADMIN },
    });

    await expect(addStudentCourse(student.id, course.id)).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      } satisfies Partial<StudentCourseError>,
    );
    await expect(enrollmentIds(student.id)).resolves.toEqual([]);
  });

  it("serializes concurrent additions from independent clients", async () => {
    const student = await createStudent();
    const existing = await createCourse(16);
    const firstTarget = await createCourse(3);
    const secondTarget = await createCourse(3);
    await completeStudentOnboarding(student.id, [existing.id]);

    const results = await Promise.allSettled([
      addStudentCourse(student.id, firstTarget.id, firstClient),
      addStudentCourse(student.id, secondTarget.id, secondClient),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(await selectedCreditHours(student.id)).toBe(19);
    expect(
      await db.courseEnrollment.count({ where: { studentId: student.id } }),
    ).toBe(2);
  });

  it("commits audit logs with successful enrollment mutations", async () => {
    const student = await createStudent();
    const course = await createCourse(3);
    await completeStudentOnboarding(student.id, []);

    await addStudentCourse(student.id, course.id);

    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        actorId: student.id,
        courseId: course.id,
        action: AUDIT_ACTIONS.STUDENT_COURSE_ADDED,
      },
    });
    expect(audit).toMatchObject({
      entityType: "CourseEnrollment",
      entityId: `${student.id}:${course.id}`,
    });
  });
});

async function createStudent() {
  const suffix = randomUUID();

  return db.user.create({
    data: {
      fullName: "Course Selection Student",
      email: `course-student-${suffix}@example.com`,
      passwordHash:
        "$2b$12$o.suRJmHqKH.vPofp/RnT.pcvzQVYKsZ3CvXutZ9wXcF7dqBPIpEm",
      role: UserRole.STUDENT,
      universityId: `COURSE-${suffix}`,
      completedCreditHours: 30,
      isTransferredThisYear: false,
      isActive: true,
      mustChangePassword: false,
      onboardingCompletedAt: null,
    },
  });
}

async function createCourse(creditHours: number) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();

  return db.course.create({
    data: {
      code: `SC${suffix}`,
      nameAr: "مقرر اختباري",
      nameEn: `Test Course ${suffix}`,
      creditHours,
    },
  });
}

async function createAdmin() {
  const suffix = randomUUID();
  return db.user.create({
    data: {
      fullName: "Course Test Admin",
      email: `course-admin-${suffix}@example.com`,
      passwordHash:
        "$2b$12$o.suRJmHqKH.vPofp/RnT.pcvzQVYKsZ3CvXutZ9wXcF7dqBPIpEm",
      role: UserRole.ADMIN,
      isActive: true,
      mustChangePassword: false,
    },
  });
}

async function enrollmentIds(studentId: string) {
  const enrollments = await db.courseEnrollment.findMany({
    where: { studentId },
    select: { courseId: true },
    orderBy: { courseId: "asc" },
  });
  return enrollments.map(({ courseId }) => courseId);
}

async function onboardingCompletedAt(studentId: string) {
  return (
    await db.user.findUniqueOrThrow({
      where: { id: studentId },
      select: { onboardingCompletedAt: true },
    })
  ).onboardingCompletedAt;
}

async function auditActions(studentId: string, action: string) {
  return db.auditLog.findMany({ where: { actorId: studentId, action } });
}

async function selectedCreditHours(studentId: string) {
  const enrollments = await db.courseEnrollment.findMany({
    where: { studentId },
    select: { course: { select: { creditHours: true } } },
  });
  return enrollments.reduce(
    (total, item) => total + item.course.creditHours,
    0,
  );
}
