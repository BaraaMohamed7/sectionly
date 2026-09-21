import { Prisma, UserRole } from "@/generated/prisma/client";
import { MAX_SELECTED_CREDIT_HOURS } from "@/lib/student-courses";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { db, type DatabaseClient } from "@/server/db";
import { StudentCourseError } from "@/server/student-courses/errors";
import {
  courseIdSchema,
  parseCourseIds,
} from "@/server/student-courses/validation";
import { writeAuditLog } from "@/server/write-audit-log";

type LockedStudent = {
  id: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  universityId: string | null;
  completedCreditHours: number | null;
  isTransferredThisYear: boolean | null;
  onboardingCompletedAt: Date | null;
};

type LockedCourse = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  creditHours: number;
};

const courseSummarySelect = {
  id: true,
  code: true,
  nameAr: true,
  nameEn: true,
  creditHours: true,
} satisfies Prisma.CourseSelect;

export async function listCoursesForOnboarding() {
  return db.course.findMany({
    select: courseSummarySelect,
    orderBy: { code: "asc" },
  });
}

export async function getStudentCourseOverview(studentId: string) {
  const id = courseIdSchema.parse(studentId);
  const [enrollments, courses] = await Promise.all([
    db.courseEnrollment.findMany({
      where: { studentId: id },
      select: {
        course: { select: courseSummarySelect },
      },
      orderBy: { course: { code: "asc" } },
    }),
    db.course.findMany({
      select: courseSummarySelect,
      orderBy: { code: "asc" },
    }),
  ]);
  const selectedIds = new Set(enrollments.map(({ course }) => course.id));
  const totalCreditHours = enrollments.reduce(
    (total, { course }) => total + course.creditHours,
    0,
  );

  return {
    selectedCourses: enrollments.map(({ course }) => course),
    availableCourses: courses.filter((course) => !selectedIds.has(course.id)),
    totalCreditHours,
    remainingCreditHours: Math.max(
      0,
      MAX_SELECTED_CREDIT_HOURS - totalCreditHours,
    ),
  };
}

export async function completeStudentOnboarding(
  studentId: string,
  submittedCourseIds: unknown,
  database: DatabaseClient = db,
) {
  const id = courseIdSchema.parse(studentId);
  const courseIds = parseCourseIds(submittedCourseIds);

  return database.$transaction(async (transaction) => {
    const student = await lockAndValidateStudent(transaction, id);

    if (student.onboardingCompletedAt !== null) {
      throw new StudentCourseError("ONBOARDING_ALREADY_COMPLETED");
    }

    const courses = await lockCoursesForShare(transaction, courseIds);
    if (courses.length !== courseIds.length) {
      throw new StudentCourseError("COURSE_NOT_FOUND");
    }

    const totalCreditHours = sumCreditHours(courses);
    assertWithinCreditLimit(totalCreditHours);

    if (courseIds.length > 0) {
      await transaction.courseEnrollment.createMany({
        data: courseIds.map((courseId) => ({
          studentId: id,
          courseId,
        })),
      });
    }
    const completedAt = new Date();
    await transaction.user.update({
      where: { id },
      data: { onboardingCompletedAt: completedAt },
    });
    await writeAuditLog(transaction, {
      actorId: id,
      action: AUDIT_ACTIONS.STUDENT_ONBOARDING_COMPLETED,
      entityType: "User",
      entityId: id,
      metadata: {
        courseIds,
        courseCount: courses.length,
        totalCreditHours,
      },
    });

    return {
      completedAt,
      courseCount: courses.length,
      totalCreditHours,
    };
  });
}

export async function addStudentCourse(
  studentId: string,
  targetCourseId: string,
  database: DatabaseClient = db,
) {
  const id = courseIdSchema.parse(studentId);
  const courseId = courseIdSchema.parse(targetCourseId);

  try {
    return await database.$transaction(async (transaction) => {
      const student = await lockAndValidateStudent(transaction, id);
      assertOnboardingCompleted(student);

      const currentEnrollments = await transaction.courseEnrollment.findMany({
        where: { studentId: id },
        select: { courseId: true },
      });
      const currentCourseIds = currentEnrollments.map(
        (enrollment) => enrollment.courseId,
      );
      const courses = await lockCoursesForShare(transaction, [
        ...currentCourseIds,
        courseId,
      ]);
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const targetCourse = courseById.get(courseId);

      if (!targetCourse) {
        throw new StudentCourseError("COURSE_NOT_FOUND");
      }
      if (currentCourseIds.includes(courseId)) {
        throw new StudentCourseError("ALREADY_ENROLLED");
      }
      if (currentCourseIds.some((currentId) => !courseById.has(currentId))) {
        throw new StudentCourseError("COURSE_NOT_FOUND");
      }

      const currentTotal = currentCourseIds.reduce(
        (total, currentId) => total + courseById.get(currentId)!.creditHours,
        0,
      );
      const totalCreditHours = currentTotal + targetCourse.creditHours;
      assertWithinCreditLimit(totalCreditHours);

      await transaction.courseEnrollment.create({
        data: { studentId: id, courseId },
      });
      await writeAuditLog(transaction, {
        actorId: id,
        courseId,
        action: AUDIT_ACTIONS.STUDENT_COURSE_ADDED,
        entityType: "CourseEnrollment",
        entityId: enrollmentEntityId(id, courseId),
        metadata: {
          courseCreditHours: targetCourse.creditHours,
          totalCreditHours,
        },
      });

      return { course: targetCourse, totalCreditHours };
    });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new StudentCourseError("ALREADY_ENROLLED");
    }
    throw error;
  }
}

export async function removeStudentCourse(
  studentId: string,
  targetCourseId: string,
  database: DatabaseClient = db,
) {
  const id = courseIdSchema.parse(studentId);
  const courseId = courseIdSchema.parse(targetCourseId);

  try {
    return await database.$transaction(async (transaction) => {
      const student = await lockAndValidateStudent(transaction, id);
      assertOnboardingCompleted(student);

      const enrollment = await transaction.courseEnrollment.findUnique({
        where: {
          studentId_courseId: { studentId: id, courseId },
        },
      });
      if (!enrollment) {
        throw new StudentCourseError("NOT_ENROLLED");
      }

      const courses = await lockCoursesForShare(transaction, [courseId]);
      if (courses.length !== 1) {
        throw new StudentCourseError("COURSE_NOT_FOUND");
      }

      await transaction.courseEnrollment.delete({
        where: {
          studentId_courseId: { studentId: id, courseId },
        },
      });
      await writeAuditLog(transaction, {
        actorId: id,
        courseId,
        action: AUDIT_ACTIONS.STUDENT_COURSE_REMOVED,
        entityType: "CourseEnrollment",
        entityId: enrollmentEntityId(id, courseId),
        metadata: { courseCreditHours: courses[0]!.creditHours },
      });

      return courses[0]!;
    });
  } catch (error) {
    if (isPrismaError(error, "P2003")) {
      throw new StudentCourseError("COURSE_REMOVAL_BLOCKED");
    }
    throw error;
  }
}

async function lockAndValidateStudent(
  transaction: Prisma.TransactionClient,
  studentId: string,
) {
  const students = await transaction.$queryRaw<LockedStudent[]>`
    SELECT
      id,
      role,
      "isActive",
      "mustChangePassword",
      "universityId",
      "completedCreditHours",
      "isTransferredThisYear",
      "onboardingCompletedAt"
    FROM "User"
    WHERE id = ${studentId}::uuid
    FOR UPDATE
  `;
  const student = students[0];

  if (
    !student ||
    student.role !== UserRole.STUDENT ||
    !student.isActive ||
    student.mustChangePassword ||
    student.universityId === null ||
    student.completedCreditHours === null ||
    student.isTransferredThisYear === null
  ) {
    throw new StudentCourseError("FORBIDDEN");
  }

  return student;
}

async function lockCoursesForShare(
  transaction: Prisma.TransactionClient,
  courseIds: string[],
) {
  const ids = [...new Set(courseIds)].sort();

  if (ids.length === 0) {
    return [];
  }

  return transaction.$queryRaw<LockedCourse[]>(Prisma.sql`
    SELECT id, code, "nameAr", "nameEn", "creditHours"
    FROM "Course"
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id
    FOR SHARE
  `);
}

function assertOnboardingCompleted(student: LockedStudent) {
  if (student.onboardingCompletedAt === null) {
    throw new StudentCourseError("ONBOARDING_NOT_COMPLETED");
  }
}

function assertWithinCreditLimit(totalCreditHours: number) {
  if (totalCreditHours > MAX_SELECTED_CREDIT_HOURS) {
    throw new StudentCourseError("CREDIT_HOUR_LIMIT_EXCEEDED");
  }
}

function sumCreditHours(courses: LockedCourse[]) {
  return courses.reduce((total, course) => total + course.creditHours, 0);
}

function enrollmentEntityId(studentId: string, courseId: string) {
  return `${studentId}:${courseId}`;
}

function isPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
