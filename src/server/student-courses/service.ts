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

type LockedAccount = {
  id: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
};

type LockedStudent = {
  id: string;
  completedCreditHours: number | null;
  isTransferredThisYear: boolean | null;
};

type StudentPrincipal = {
  userId: string;
  studentId: string;
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

export async function getStudentCourseOverview(
  userId: string,
  database: DatabaseClient = db,
) {
  const principal = await resolveStudentPrincipal(database, userId);
  const [enrollments, courses] = await Promise.all([
    database.courseEnrollment.findMany({
      where: { studentId: principal.studentId },
      select: { course: { select: courseSummarySelect } },
      orderBy: { course: { code: "asc" } },
    }),
    database.course.findMany({
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
  userId: string,
  submittedCourseIds: unknown,
  database: DatabaseClient = db,
) {
  const accountId = courseIdSchema.parse(userId);
  const courseIds = parseCourseIds(submittedCourseIds);

  return database.$transaction(async (transaction) => {
    const principal = await lockAndValidateStudent(transaction, accountId);
    const existing = await transaction.courseEnrollment.findMany({
      where: { studentId: principal.studentId },
      select: { courseId: true },
    });
    const existingIds = existing.map(({ courseId }) => courseId);
    const allCourseIds = [...new Set([...existingIds, ...courseIds])];
    const courses = await lockCoursesForShare(transaction, allCourseIds);
    if (courses.length !== allCourseIds.length) {
      throw new StudentCourseError("COURSE_NOT_FOUND");
    }

    const totalCreditHours = sumCreditHours(courses);
    assertWithinCreditLimit(totalCreditHours);
    const existingSet = new Set(existingIds);
    const newCourseIds = courseIds.filter((courseId) => !existingSet.has(courseId));
    if (newCourseIds.length > 0) {
      await transaction.courseEnrollment.createMany({
        data: newCourseIds.map((courseId) => ({
          studentId: principal.studentId,
          courseId,
        })),
      });
    }
    await writeAuditLog(transaction, {
      actorId: principal.userId,
      action: AUDIT_ACTIONS.STUDENT_INITIAL_COURSE_SELECTION_SAVED,
      entityType: "Student",
      entityId: principal.studentId,
      metadata: {
        submittedCourseIds: courseIds,
        addedCourseIds: newCourseIds,
        selectedCourseCount: courses.length,
        totalCreditHours,
      },
    });

    return {
      addedCourseCount: newCourseIds.length,
      selectedCourseCount: courses.length,
      totalCreditHours,
    };
  });
}

export async function addStudentCourse(
  userId: string,
  targetCourseId: string,
  database: DatabaseClient = db,
) {
  const accountId = courseIdSchema.parse(userId);
  const courseId = courseIdSchema.parse(targetCourseId);

  try {
    return await database.$transaction(async (transaction) => {
      const principal = await lockAndValidateStudent(transaction, accountId);
      const currentEnrollments = await transaction.courseEnrollment.findMany({
        where: { studentId: principal.studentId },
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

      if (!targetCourse) throw new StudentCourseError("COURSE_NOT_FOUND");
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
        data: { studentId: principal.studentId, courseId },
      });
      await writeAuditLog(transaction, {
        actorId: principal.userId,
        courseId,
        action: AUDIT_ACTIONS.STUDENT_COURSE_ADDED,
        entityType: "CourseEnrollment",
        entityId: enrollmentEntityId(principal.studentId, courseId),
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
  userId: string,
  targetCourseId: string,
  database: DatabaseClient = db,
) {
  const accountId = courseIdSchema.parse(userId);
  const courseId = courseIdSchema.parse(targetCourseId);

  try {
    return await database.$transaction(async (transaction) => {
      const principal = await lockAndValidateStudent(transaction, accountId);
      const enrollment = await transaction.courseEnrollment.findUnique({
        where: {
          studentId_courseId: { studentId: principal.studentId, courseId },
        },
      });
      if (!enrollment) throw new StudentCourseError("NOT_ENROLLED");

      const courses = await lockCoursesForShare(transaction, [courseId]);
      if (courses.length !== 1) {
        throw new StudentCourseError("COURSE_NOT_FOUND");
      }

      await transaction.courseEnrollment.delete({
        where: {
          studentId_courseId: { studentId: principal.studentId, courseId },
        },
      });
      await writeAuditLog(transaction, {
        actorId: principal.userId,
        courseId,
        action: AUDIT_ACTIONS.STUDENT_COURSE_REMOVED,
        entityType: "CourseEnrollment",
        entityId: enrollmentEntityId(principal.studentId, courseId),
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

async function resolveStudentPrincipal(
  database: DatabaseClient,
  inputUserId: string,
): Promise<StudentPrincipal> {
  const userId = courseIdSchema.parse(inputUserId);
  const account = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      student: {
        select: {
          id: true,
          completedCreditHours: true,
          isTransferredThisYear: true,
        },
      },
    },
  });
  if (
    !account ||
    account.role !== UserRole.STUDENT ||
    !account.isActive ||
    account.mustChangePassword ||
    !account.student ||
    account.student.completedCreditHours === null ||
    account.student.isTransferredThisYear === null
  ) {
    throw new StudentCourseError("FORBIDDEN");
  }
  return { userId: account.id, studentId: account.student.id };
}

async function lockAndValidateStudent(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<StudentPrincipal> {
  const accounts = await transaction.$queryRaw<LockedAccount[]>`
    SELECT id, role, "isActive", "mustChangePassword"
    FROM "User"
    WHERE id = ${userId}::uuid
    FOR SHARE
  `;
  const account = accounts[0];
  if (
    !account ||
    account.role !== UserRole.STUDENT ||
    !account.isActive ||
    account.mustChangePassword
  ) {
    throw new StudentCourseError("FORBIDDEN");
  }

  const students = await transaction.$queryRaw<LockedStudent[]>`
    SELECT id, "completedCreditHours", "isTransferredThisYear"
    FROM "Student"
    WHERE "userId" = ${userId}::uuid
    FOR UPDATE
  `;
  const student = students[0];
  if (
    !student ||
    student.completedCreditHours === null ||
    student.isTransferredThisYear === null
  ) {
    throw new StudentCourseError("FORBIDDEN");
  }
  return { userId: account.id, studentId: student.id };
}

async function lockCoursesForShare(
  transaction: Prisma.TransactionClient,
  courseIds: string[],
) {
  const ids = [...new Set(courseIds)].sort();
  if (ids.length === 0) return [];

  return transaction.$queryRaw<LockedCourse[]>(Prisma.sql`
    SELECT id, code, "nameAr", "nameEn", "creditHours"
    FROM "Course"
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id
    FOR SHARE
  `);
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
