import { Prisma, UserRole } from "@/generated/prisma/client";
import { hashPassword } from "@/server/auth/password";
import { db, type DatabaseClient } from "@/server/db";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { SuperAdminError } from "@/server/super-admin/errors";
import { generateTemporaryPassword } from "@/server/super-admin/temporary-password";
import { acquireActiveSuperAdminLock } from "@/server/super-admin/transactions";
import { createAdminSchema } from "@/server/super-admin/validation";
import { writeAuditLog } from "@/server/write-audit-log";

export async function bootstrapInitialSuperAdmin(
  input: unknown,
  database: DatabaseClient = db,
) {
  const data = createAdminSchema.parse(input);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const superAdmin = await database.$transaction(async (transaction) => {
      await acquireActiveSuperAdminLock(transaction);

      const activeSuperAdmins = await transaction.user.count({
        where: { role: UserRole.SUPER_ADMIN, isActive: true },
      });

      if (activeSuperAdmins !== 0) {
        throw new SuperAdminError("ACTIVE_SUPER_ADMIN_EXISTS");
      }

      const created = await transaction.user.create({
        data: {
          fullName: data.fullName,
          email: data.email,
          passwordHash,
          role: UserRole.SUPER_ADMIN,
          isActive: true,
          mustChangePassword: true,
          universityId: null,
          completedCreditHours: null,
          isTransferredThisYear: null,
          onboardingCompletedAt: null,
        },
        select: { id: true, fullName: true, email: true, role: true },
      });

      await writeAuditLog(transaction, {
        action: AUDIT_ACTIONS.SUPER_ADMIN_BOOTSTRAPPED,
        entityType: "User",
        entityId: created.id,
        metadata: { email: created.email },
      });

      return created;
    });

    return { superAdmin, temporaryPassword };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SuperAdminError("EMAIL_EXISTS");
    }
    throw error;
  }
}
