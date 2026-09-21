import { Prisma, UserRole } from "@/generated/prisma/client";
import { db, type DatabaseClient } from "@/server/db";
import { AUDIT_ACTIONS } from "@/server/super-admin/actions";
import { writeAuditLog } from "@/server/super-admin/audit";
import { SuperAdminError } from "@/server/super-admin/errors";
import {
  assertActiveSuperAdmin,
  lockAndAssertActiveSuperAdmin,
  lockCourseAdminsForUpdate,
  lockCourseForUpdate,
  lockUsersForShare,
} from "@/server/super-admin/transactions";
import { idSchema, parseCourseInput } from "@/server/super-admin/validation";

const courseSelect = {
  id: true,
  code: true,
  nameAr: true,
  nameEn: true,
  creditHours: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  switchingOpensAt: true,
  switchingClosesAt: true,
  registrationPaused: true,
  switchingPaused: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourseSelect;

export async function listCourses() {
  return db.course.findMany({
    select: {
      ...courseSelect,
      admins: {
        select: {
          isPrimary: true,
          admin: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ isPrimary: "desc" }, { admin: { fullName: "asc" } }],
      },
    },
    orderBy: { code: "asc" },
  });
}

export async function getCourse(courseId: string) {
  return db.course.findUnique({
    where: { id: idSchema.parse(courseId) },
    select: {
      ...courseSelect,
      admins: {
        select: {
          isPrimary: true,
          assignedAt: true,
          admin: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ isPrimary: "desc" }, { admin: { fullName: "asc" } }],
      },
    },
  });
}

export async function createCourse(
  actorId: string,
  input: unknown,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const data = parseCourseInput(input);

  try {
    return await database.$transaction(async (transaction) => {
      await lockAndAssertActiveSuperAdmin(transaction, actor);
      const course = await transaction.course.create({
        data,
        select: courseSelect,
      });

      await writeAuditLog(transaction, {
        actorId: actor,
        courseId: course.id,
        action: AUDIT_ACTIONS.COURSE_CREATED,
        entityType: "Course",
        entityId: course.id,
        metadata: { code: course.code },
      });

      return course;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new SuperAdminError("COURSE_CODE_EXISTS");
    }
    throw error;
  }
}

export async function updateCourse(
  actorId: string,
  courseId: string,
  input: unknown,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const targetCourse = idSchema.parse(courseId);
  const data = parseCourseInput(input);

  try {
    return await database.$transaction(async (transaction) => {
      await lockAndAssertActiveSuperAdmin(transaction, actor);
      await lockCourseForUpdate(transaction, targetCourse);
      const previous = await transaction.course.findUniqueOrThrow({
        where: { id: targetCourse },
        select: courseSelect,
      });
      const course = await transaction.course.update({
        where: { id: targetCourse },
        data,
        select: courseSelect,
      });

      await writeAuditLog(transaction, {
        actorId: actor,
        courseId: targetCourse,
        action: AUDIT_ACTIONS.COURSE_UPDATED,
        entityType: "Course",
        entityId: targetCourse,
        metadata: { changedFields: changedCourseFields(previous, course) },
      });

      return course;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new SuperAdminError("COURSE_CODE_EXISTS");
    }
    throw error;
  }
}

export async function assignCourseAdmin(
  actorId: string,
  courseId: string,
  adminId: string,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const course = idSchema.parse(courseId);
  const target = idSchema.parse(adminId);

  return database.$transaction(async (transaction) => {
    const users = await lockUsersForShare(transaction, [actor, target]);
    assertActiveSuperAdmin(users, actor);
    assertAssignableAdmin(users, target);
    await lockCourseForUpdate(transaction, course);
    await lockCourseAdminsForUpdate(transaction, course);

    const existing = await transaction.courseAdmin.findUnique({
      where: { courseId_adminId: { courseId: course, adminId: target } },
    });
    if (existing) {
      throw new SuperAdminError("ASSIGNMENT_EXISTS");
    }

    const assignment = await transaction.courseAdmin.create({
      data: { courseId: course, adminId: target },
    });
    await writeAuditLog(transaction, {
      actorId: actor,
      courseId: course,
      action: AUDIT_ACTIONS.COURSE_ADMIN_ASSIGNED,
      entityType: "CourseAdmin",
      entityId: target,
      metadata: { adminId: target },
    });

    return assignment;
  });
}

export async function unassignCourseAdmin(
  actorId: string,
  courseId: string,
  adminId: string,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const course = idSchema.parse(courseId);
  const target = idSchema.parse(adminId);

  return database.$transaction(async (transaction) => {
    const users = await lockUsersForShare(transaction, [actor, target]);
    assertActiveSuperAdmin(users, actor);
    await lockCourseForUpdate(transaction, course);
    await lockCourseAdminsForUpdate(transaction, course);

    const assignment = await transaction.courseAdmin.findUnique({
      where: { courseId_adminId: { courseId: course, adminId: target } },
    });
    if (!assignment) {
      throw new SuperAdminError("ASSIGNMENT_NOT_FOUND");
    }

    await transaction.courseAdmin.delete({
      where: { courseId_adminId: { courseId: course, adminId: target } },
    });
    await writeAuditLog(transaction, {
      actorId: actor,
      courseId: course,
      action: AUDIT_ACTIONS.COURSE_ADMIN_UNASSIGNED,
      entityType: "CourseAdmin",
      entityId: target,
      metadata: { adminId: target, wasPrimary: assignment.isPrimary },
    });
    if (assignment.isPrimary) {
      await writeAuditLog(transaction, {
        actorId: actor,
        courseId: course,
        action: AUDIT_ACTIONS.COURSE_PRIMARY_ADMIN_CHANGED,
        entityType: "Course",
        entityId: course,
        metadata: {
          previousPrimaryAdminId: target,
          primaryAdminId: null,
        },
      });
    }
  });
}

export async function setPrimaryCourseAdmin(
  actorId: string,
  courseId: string,
  adminId: string | null,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const course = idSchema.parse(courseId);
  const target = adminId === null ? null : idSchema.parse(adminId);

  return database.$transaction(async (transaction) => {
    const users = await lockUsersForShare(
      transaction,
      target === null ? [actor] : [actor, target],
    );
    assertActiveSuperAdmin(users, actor);
    if (target !== null) {
      assertAssignableAdmin(users, target);
    }
    await lockCourseForUpdate(transaction, course);
    await lockCourseAdminsForUpdate(transaction, course);

    const assignments = await transaction.courseAdmin.findMany({
      where: { courseId: course },
      select: { adminId: true, isPrimary: true },
    });
    const previousPrimary = assignments.find(
      (entry) => entry.isPrimary,
    )?.adminId;

    if (
      target !== null &&
      !assignments.some((entry) => entry.adminId === target)
    ) {
      throw new SuperAdminError("ASSIGNMENT_NOT_FOUND");
    }
    if ((previousPrimary ?? null) === target) {
      throw new SuperAdminError("INVALID_ADMIN_TRANSITION");
    }

    await transaction.courseAdmin.updateMany({
      where: { courseId: course, isPrimary: true },
      data: { isPrimary: false },
    });
    if (target !== null) {
      await transaction.courseAdmin.update({
        where: { courseId_adminId: { courseId: course, adminId: target } },
        data: { isPrimary: true },
      });
    }

    await writeAuditLog(transaction, {
      actorId: actor,
      courseId: course,
      action: AUDIT_ACTIONS.COURSE_PRIMARY_ADMIN_CHANGED,
      entityType: "Course",
      entityId: course,
      metadata: {
        previousPrimaryAdminId: previousPrimary ?? null,
        primaryAdminId: target,
      },
    });
  });
}

function assertAssignableAdmin(
  users: Awaited<ReturnType<typeof lockUsersForShare>>,
  adminId: string,
) {
  const admin = users.find((user) => user.id === adminId);

  if (
    !admin ||
    (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN)
  ) {
    throw new SuperAdminError("INVALID_ASSIGNEE_ROLE");
  }
}

function changedCourseFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  return Object.keys(next).filter((key) => {
    if (key === "updatedAt" || key === "createdAt" || key === "id") {
      return false;
    }
    const previousValue = previous[key];
    const nextValue = next[key];
    return previousValue instanceof Date && nextValue instanceof Date
      ? previousValue.getTime() !== nextValue.getTime()
      : previousValue !== nextValue;
  });
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
