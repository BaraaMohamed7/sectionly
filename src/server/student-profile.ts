import { UserRole } from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { completeStudentProfileSchema } from "@/server/auth/validation";
import { db, type DatabaseClient } from "@/server/db";
import { writeAuditLog } from "@/server/write-audit-log";

export class StudentProfileError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "STUDENT_LINK_REQUIRED",
  ) {
    super(code);
    this.name = "StudentProfileError";
  }
}

export async function completeStudentProfile(
  userId: string,
  input: unknown,
  database: DatabaseClient = db,
) {
  const data = completeStudentProfileSchema.parse(input);

  return database.$transaction(async (transaction) => {
    const accounts = await transaction.$queryRaw<
      Array<{
        id: string;
        role: UserRole;
        isActive: boolean;
        mustChangePassword: boolean;
      }>
    >`
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
      throw new StudentProfileError("FORBIDDEN");
    }

    const students = await transaction.$queryRaw<
      Array<{
        id: string;
        universityId: string;
        fullName: string;
        completedCreditHours: number | null;
        isTransferredThisYear: boolean | null;
        userId: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT
        id,
        "universityId",
        "fullName",
        "completedCreditHours",
        "isTransferredThisYear",
        "userId",
        "createdAt",
        "updatedAt"
      FROM "Student"
      WHERE "userId" = ${userId}::uuid
      FOR UPDATE
    `;
    const student = students[0];
    if (!student) throw new StudentProfileError("STUDENT_LINK_REQUIRED");
    if (
      student.completedCreditHours !== null &&
      student.isTransferredThisYear !== null
    ) {
      return student;
    }

    const updated = await transaction.student.update({
      where: { id: student.id },
      data: {
        completedCreditHours:
          student.completedCreditHours ?? data.completedCreditHours,
        isTransferredThisYear:
          student.isTransferredThisYear ?? data.isTransferredThisYear,
      },
    });
    await writeAuditLog(transaction, {
      actorId: userId,
      action: AUDIT_ACTIONS.STUDENT_PROFILE_COMPLETED,
      entityType: "Student",
      entityId: student.id,
      metadata: {
        completedCreditHours: updated.completedCreditHours,
        isTransferredThisYear: updated.isTransferredThisYear,
      },
    });
    return updated;
  });
}
