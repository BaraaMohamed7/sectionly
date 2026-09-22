import { Prisma, UserRole } from "@/generated/prisma/client";
import { hashPassword } from "@/server/auth/password";
import { db, type DatabaseClient } from "@/server/db";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { SuperAdminError } from "@/server/super-admin/errors";
import { generateTemporaryPassword } from "@/server/super-admin/temporary-password";
import {
  acquireActiveSuperAdminLock,
  assertActiveSuperAdmin,
  lockUsersForShare,
  lockUsersForUpdate,
} from "@/server/super-admin/transactions";
import {
  createAdminSchema,
  idSchema,
  managedAdminRoleSchema,
} from "@/server/super-admin/validation";
import { writeAuditLog } from "@/server/write-audit-log";

const adminSelect = {
  id: true,
  adminName: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export async function listAdminAccounts() {
  return db.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } },
    select: adminSelect,
    orderBy: [{ role: "desc" }, { adminName: "asc" }],
  });
}

export async function getAdminAccount(adminId: string) {
  return db.user.findFirst({
    where: {
      id: idSchema.parse(adminId),
      role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
    },
    select: {
      ...adminSelect,
      courseAssignments: {
        select: {
          isPrimary: true,
          course: { select: { id: true, code: true, nameEn: true } },
        },
        orderBy: { course: { code: "asc" } },
      },
    },
  });
}

export async function createAdminAccount(
  actorId: string,
  input: unknown,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const data = createAdminSchema.parse(input);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const admin = await database.$transaction(async (transaction) => {
      const lockedUsers = await lockUsersForShare(transaction, [actor]);
      assertActiveSuperAdmin(lockedUsers, actor);

      const created = await transaction.user.create({
        data: {
          adminName: data.adminName,
          email: data.email,
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
          mustChangePassword: true,
        },
        select: adminSelect,
      });

      await writeAuditLog(transaction, {
        actorId: actor,
        action: AUDIT_ACTIONS.ADMIN_CREATED,
        entityType: "User",
        entityId: created.id,
        metadata: { role: UserRole.ADMIN, email: created.email },
      });

      return created;
    });

    return { admin, temporaryPassword };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new SuperAdminError("EMAIL_EXISTS");
    }
    throw error;
  }
}

export async function setAdminActive(
  actorId: string,
  adminId: string,
  isActive: boolean,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const target = idSchema.parse(adminId);

  return database.$transaction(async (transaction) => {
    await acquireActiveSuperAdminLock(transaction);
    const users = await lockUsersForUpdate(transaction, [actor, target]);
    assertActiveSuperAdmin(users, actor);
    const admin = getManagedAdmin(users, target);

    if (admin.isActive === isActive) {
      throw new SuperAdminError("INVALID_ADMIN_TRANSITION");
    }

    if (!isActive && admin.role === UserRole.SUPER_ADMIN) {
      await assertAnotherActiveSuperAdmin(transaction, target);
    }

    const updated = await transaction.user.update({
      where: { id: target },
      data: { isActive },
      select: adminSelect,
    });

    await writeAuditLog(transaction, {
      actorId: actor,
      action: isActive
        ? AUDIT_ACTIONS.ADMIN_ACTIVATED
        : AUDIT_ACTIONS.ADMIN_DEACTIVATED,
      entityType: "User",
      entityId: target,
      metadata: { previousIsActive: admin.isActive, isActive },
    });

    return updated;
  });
}

export async function setAdminRole(
  actorId: string,
  adminId: string,
  role: unknown,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const target = idSchema.parse(adminId);
  const nextRole = managedAdminRoleSchema.parse(role);

  return database.$transaction(async (transaction) => {
    await acquireActiveSuperAdminLock(transaction);
    const users = await lockUsersForUpdate(transaction, [actor, target]);
    assertActiveSuperAdmin(users, actor);
    const admin = getManagedAdmin(users, target);

    if (admin.role === nextRole) {
      throw new SuperAdminError("INVALID_ADMIN_TRANSITION");
    }

    if (nextRole === UserRole.ADMIN && admin.isActive) {
      await assertAnotherActiveSuperAdmin(transaction, target);
    }

    const updated = await transaction.user.update({
      where: { id: target },
      data: { role: nextRole },
      select: adminSelect,
    });

    await writeAuditLog(transaction, {
      actorId: actor,
      action:
        nextRole === UserRole.SUPER_ADMIN
          ? AUDIT_ACTIONS.ADMIN_PROMOTED_TO_SUPER_ADMIN
          : AUDIT_ACTIONS.SUPER_ADMIN_DEMOTED_TO_ADMIN,
      entityType: "User",
      entityId: target,
      metadata: { previousRole: admin.role, role: nextRole },
    });

    return updated;
  });
}

export async function reissueAdminTemporaryPassword(
  actorId: string,
  adminId: string,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const target = idSchema.parse(adminId);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const admin = await database.$transaction(async (transaction) => {
    const users = await lockUsersForUpdate(transaction, [actor, target]);
    assertActiveSuperAdmin(users, actor);
    getManagedAdmin(users, target);

    const updated = await transaction.user.update({
      where: { id: target },
      data: { passwordHash, mustChangePassword: true },
      select: adminSelect,
    });

    await writeAuditLog(transaction, {
      actorId: actor,
      action: AUDIT_ACTIONS.ADMIN_TEMPORARY_PASSWORD_REISSUED,
      entityType: "User",
      entityId: target,
    });

    return updated;
  });

  return { admin, temporaryPassword };
}

function getManagedAdmin(
  users: Awaited<ReturnType<typeof lockUsersForUpdate>>,
  adminId: string,
) {
  const admin = users.find((user) => user.id === adminId);

  if (
    !admin ||
    (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN)
  ) {
    throw new SuperAdminError("ADMIN_NOT_FOUND");
  }

  return admin;
}

async function assertAnotherActiveSuperAdmin(
  transaction: Prisma.TransactionClient,
  excludedUserId: string,
) {
  const count = await transaction.user.count({
    where: {
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      id: { not: excludedUserId },
    },
  });

  if (count === 0) {
    throw new SuperAdminError("LAST_ACTIVE_SUPER_ADMIN");
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
