import { Prisma, UserRole } from "@/generated/prisma/client";
import type { DatabaseClient } from "@/server/db";
import { CourseManagementError } from "@/server/course-management/errors";

type LockedManager = {
  id: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
};

export async function lockCourseManagementAccess(
  transaction: Prisma.TransactionClient,
  actorId: string,
  courseId: string,
  courseLock: "SHARE" | "UPDATE",
) {
  const managers = await transaction.$queryRaw<LockedManager[]>`
    SELECT id, role, "isActive", "mustChangePassword"
    FROM "User"
    WHERE id = ${actorId}::uuid
    FOR SHARE
  `;
  const manager = managers[0];

  if (
    !manager ||
    (manager.role !== UserRole.ADMIN && manager.role !== UserRole.SUPER_ADMIN) ||
    !manager.isActive ||
    manager.mustChangePassword
  ) {
    throw new CourseManagementError("FORBIDDEN");
  }

  const selection = Prisma.sql`
    SELECT id
    FROM "Course"
    WHERE id = ${courseId}::uuid
  `;
  const query =
    courseLock === "UPDATE"
      ? Prisma.sql`${selection} FOR UPDATE`
      : Prisma.sql`${selection} FOR SHARE`;
  const courses = await transaction.$queryRaw<Array<{ id: string }>>(query);

  if (courses.length !== 1) {
    throw new CourseManagementError("COURSE_NOT_FOUND");
  }

  if (manager.role === UserRole.ADMIN) {
    const assignment = await transaction.courseAdmin.findUnique({
      where: { courseId_adminId: { courseId, adminId: actorId } },
      select: { adminId: true },
    });
    if (!assignment) {
      throw new CourseManagementError("UNAUTHORIZED_COURSE");
    }
  }

  return manager;
}

export async function assertCourseManagementAccess(
  database: DatabaseClient,
  actorId: string,
  courseId: string,
) {
  const manager = await database.user.findUnique({
    where: { id: actorId },
    select: { role: true, isActive: true, mustChangePassword: true },
  });
  if (
    !manager ||
    (manager.role !== UserRole.ADMIN && manager.role !== UserRole.SUPER_ADMIN) ||
    !manager.isActive ||
    manager.mustChangePassword
  ) {
    throw new CourseManagementError("FORBIDDEN");
  }
  const course = await database.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });
  if (!course) throw new CourseManagementError("COURSE_NOT_FOUND");
  if (manager.role === UserRole.ADMIN) {
    const assignment = await database.courseAdmin.findUnique({
      where: { courseId_adminId: { courseId, adminId: actorId } },
      select: { adminId: true },
    });
    if (!assignment) throw new CourseManagementError("UNAUTHORIZED_COURSE");
  }
}
