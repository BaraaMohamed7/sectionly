import {
  Prisma,
  StudentLinkClaimStatus,
  UserRole,
} from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { db, type DatabaseClient } from "@/server/db";
import { SuperAdminError } from "@/server/super-admin/errors";
import {
  assertActiveSuperAdmin,
  lockUsersForUpdate,
} from "@/server/super-admin/transactions";
import { idSchema } from "@/server/super-admin/validation";
import { writeAuditLog } from "@/server/write-audit-log";

export type StudentLinkDecision = "approve" | "reject";

export async function listPendingStudentLinkClaims() {
  return db.studentLinkClaim.findMany({
    where: { status: StudentLinkClaimStatus.PENDING },
    select: {
      id: true,
      createdAt: true,
      user: { select: { id: true, email: true, isActive: true } },
      student: {
        select: {
          id: true,
          fullName: true,
          universityId: true,
          completedCreditHours: true,
          isTransferredThisYear: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function resolveStudentLinkClaim(
  actorId: string,
  claimId: string,
  decision: StudentLinkDecision,
  database: DatabaseClient = db,
) {
  const actor = idSchema.parse(actorId);
  const claim = idSchema.parse(claimId);

  return database.$transaction(async (transaction) => {
    const discovered = await transaction.studentLinkClaim.findUnique({
      where: { id: claim },
      select: { userId: true, studentId: true },
    });
    if (!discovered) throw new SuperAdminError("STUDENT_LINK_CLAIM_NOT_FOUND");

    const users = await lockUsersForUpdate(transaction, [
      actor,
      discovered.userId,
    ]);
    assertActiveSuperAdmin(users, actor);
    const requestingUser = users.find((user) => user.id === discovered.userId);

    const students = await transaction.$queryRaw<
      Array<{ id: string; userId: string | null }>
    >`
      SELECT id, "userId"
      FROM "Student"
      WHERE id = ${discovered.studentId}::uuid
      FOR UPDATE
    `;
    const lockedClaims = await transaction.$queryRaw<
      Array<{
        id: string;
        userId: string;
        studentId: string;
        status: StudentLinkClaimStatus;
      }>
    >`
      SELECT id, "userId", "studentId", status
      FROM "StudentLinkClaim"
      WHERE id = ${claim}::uuid
      FOR UPDATE
    `;
    const student = students[0];
    const lockedClaim = lockedClaims[0];
    if (!student || !lockedClaim) {
      throw new SuperAdminError("STUDENT_LINK_CLAIM_NOT_FOUND");
    }
    if (
      lockedClaim.status !== StudentLinkClaimStatus.PENDING ||
      lockedClaim.userId !== discovered.userId ||
      lockedClaim.studentId !== discovered.studentId
    ) {
      throw new SuperAdminError("STUDENT_LINK_CLAIM_NOT_PENDING");
    }
    if (!requestingUser) {
      throw new SuperAdminError("INVALID_STUDENT_LINK_USER");
    }

    if (decision === "approve") {
      if (
        requestingUser.role !== UserRole.STUDENT ||
        !requestingUser.isActive ||
        requestingUser.mustChangePassword
      ) {
        throw new SuperAdminError("INVALID_STUDENT_LINK_USER");
      }
      if (student.userId !== null) {
        throw new SuperAdminError("STUDENT_ALREADY_LINKED");
      }
      const existingLink = await transaction.student.findUnique({
        where: { userId: requestingUser.id },
        select: { id: true },
      });
      if (existingLink) throw new SuperAdminError("STUDENT_ALREADY_LINKED");

      await transaction.student.update({
        where: { id: student.id },
        data: { userId: requestingUser.id },
      });
    }

    const resolvedAt = await getDatabaseNow(transaction);
    const status =
      decision === "approve"
        ? StudentLinkClaimStatus.APPROVED
        : StudentLinkClaimStatus.REJECTED;
    const resolved = await transaction.studentLinkClaim.update({
      where: { id: claim },
      data: { status, resolvedAt, resolvedById: actor },
    });
    await writeAuditLog(transaction, {
      actorId: actor,
      action:
        decision === "approve"
          ? AUDIT_ACTIONS.STUDENT_LINK_CLAIM_APPROVED
          : AUDIT_ACTIONS.STUDENT_LINK_CLAIM_REJECTED,
      entityType: "StudentLinkClaim",
      entityId: claim,
      metadata: {
        studentId: student.id,
        userId: requestingUser.id,
      },
    });
    return resolved;
  });
}

async function getDatabaseNow(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ now: Date }>>`
    SELECT clock_timestamp() AS now
  `;
  return rows[0]!.now;
}
