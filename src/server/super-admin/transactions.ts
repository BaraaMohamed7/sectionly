import { Prisma, UserRole } from "@/generated/prisma/client";
import { SuperAdminError } from "@/server/super-admin/errors";

export const ACTIVE_SUPER_ADMIN_LOCK_KEY = BigInt("6000276107827301964");

export type LockedUser = {
  id: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
};

export async function acquireActiveSuperAdminLock(
  transaction: Prisma.TransactionClient,
) {
  await transaction.$queryRaw`
    SELECT 1::int AS locked
    FROM pg_advisory_xact_lock(${ACTIVE_SUPER_ADMIN_LOCK_KEY})
  `;
}

export async function lockUsersForUpdate(
  transaction: Prisma.TransactionClient,
  userIds: string[],
) {
  return lockUsers(transaction, userIds, "UPDATE");
}

export async function lockUsersForShare(
  transaction: Prisma.TransactionClient,
  userIds: string[],
) {
  return lockUsers(transaction, userIds, "SHARE");
}

async function lockUsers(
  transaction: Prisma.TransactionClient,
  userIds: string[],
  mode: "UPDATE" | "SHARE",
) {
  const ids = [...new Set(userIds)].sort();

  if (ids.length === 0) {
    return [];
  }

  const selection = Prisma.sql`
    SELECT id, role, "isActive", "mustChangePassword"
    FROM "User"
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id
  `;
  const query =
    mode === "UPDATE"
      ? Prisma.sql`${selection} FOR UPDATE`
      : Prisma.sql`${selection} FOR SHARE`;

  return transaction.$queryRaw<LockedUser[]>(query);
}

export function assertActiveSuperAdmin(users: LockedUser[], actorId: string) {
  const actor = users.find((user) => user.id === actorId);

  if (
    !actor ||
    actor.role !== UserRole.SUPER_ADMIN ||
    !actor.isActive ||
    actor.mustChangePassword
  ) {
    throw new SuperAdminError("FORBIDDEN");
  }

  return actor;
}

export async function lockAndAssertActiveSuperAdmin(
  transaction: Prisma.TransactionClient,
  actorId: string,
) {
  const users = await lockUsersForShare(transaction, [actorId]);
  return assertActiveSuperAdmin(users, actorId);
}

export async function lockCourseForUpdate(
  transaction: Prisma.TransactionClient,
  courseId: string,
) {
  const courses = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Course"
    WHERE id = ${courseId}::uuid
    FOR UPDATE
  `;

  if (courses.length !== 1) {
    throw new SuperAdminError("COURSE_NOT_FOUND");
  }
}

export async function lockCourseAdminsForUpdate(
  transaction: Prisma.TransactionClient,
  courseId: string,
) {
  await transaction.$queryRaw`
    SELECT "adminId"
    FROM "CourseAdmin"
    WHERE "courseId" = ${courseId}::uuid
    ORDER BY "adminId"
    FOR UPDATE
  `;
}
