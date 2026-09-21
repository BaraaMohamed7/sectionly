import { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/server/super-admin/actions";

export async function writeAuditLog(
  transaction: Prisma.TransactionClient,
  input: {
    actorId?: string;
    courseId?: string;
    action: AuditAction;
    entityType: "User" | "Course" | "CourseAdmin";
    entityId?: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await transaction.auditLog.create({
    data: {
      actorId: input.actorId,
      courseId: input.courseId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}
