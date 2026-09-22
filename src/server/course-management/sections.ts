import { Prisma } from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { lockCourseManagementAccess } from "@/server/course-management/authorization";
import {
  emptyConflictPreview,
  findOperationalConflicts,
  findStudentConflictsForSectionEdit,
  findStudentTransferConflicts,
  hasConflictWarnings,
  type ConflictPreview,
} from "@/server/course-management/conflicts";
import {
  createDeletionReviewToken,
  deletionReviewTokenMatches,
  type DeletionReviewState,
} from "@/server/course-management/deletion-review";
import { CourseManagementError } from "@/server/course-management/errors";
import {
  parseExpectedUpdatedAt,
  parseSectionInput,
  parseTransfers,
  type SectionInput,
  type StudentTransfer,
  uuidSchema,
} from "@/server/course-management/validation";
import { db, type DatabaseClient } from "@/server/db";
import { writeAuditLog } from "@/server/write-audit-log";

type LockedSection = {
  id: string;
  courseId: string;
  sectionNumber: number;
  responsibleAdminId: string;
  day: SectionInput["day"];
  startMinute: number;
  endMinute: number;
  location: string;
  capacity: number;
  isPublished: boolean;
  updatedAt: Date;
};

type DeletionSection = Pick<
  LockedSection,
  | "id"
  | "courseId"
  | "sectionNumber"
  | "day"
  | "startMinute"
  | "endMinute"
  | "capacity"
>;

export async function previewSectionCreation(
  actorId: string,
  courseId: string,
  input: unknown,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const course = uuidSchema.parse(courseId);
  const data = parseSectionInput(input);

  return database.$transaction(async (transaction) => {
    await lockCourseManagementAccess(transaction, actor, course, "SHARE");
    await assertResponsibleAdminAssigned(
      transaction,
      course,
      data.responsibleAdminId,
    );
    return buildSectionWarnings(transaction, data);
  });
}

export async function createSection(
  actorId: string,
  courseId: string,
  input: unknown,
  database: DatabaseClient = db,
) {
  return executeCreateSection(actorId, courseId, input, false, database);
}

export async function confirmCreateSection(
  actorId: string,
  courseId: string,
  input: unknown,
  database: DatabaseClient = db,
) {
  return executeCreateSection(actorId, courseId, input, true, database);
}

async function executeCreateSection(
  actorId: string,
  courseId: string,
  input: unknown,
  conflictsConfirmed: boolean,
  database: DatabaseClient,
) {
  const actor = uuidSchema.parse(actorId);
  const course = uuidSchema.parse(courseId);
  const data = parseSectionInput(input);

  try {
    return await database.$transaction(async (transaction) => {
      await lockCourseManagementAccess(transaction, actor, course, "SHARE");
      await assertResponsibleAdminAssigned(
        transaction,
        course,
        data.responsibleAdminId,
      );
      const warnings = await buildSectionWarnings(transaction, data);
      if (!conflictsConfirmed && hasConflictWarnings(warnings)) {
        throw new CourseManagementError(
          "CONFLICT_CONFIRMATION_REQUIRED",
          warnings,
        );
      }

      const section = await transaction.section.create({
        data: {
          courseId: course,
          ...data,
          isPublished: false,
        },
      });
      await writeAuditLog(transaction, {
        actorId: actor,
        courseId: course,
        action: AUDIT_ACTIONS.SECTION_CREATED,
        entityType: "Section",
        entityId: section.id,
        metadata: {
          sectionNumber: section.sectionNumber,
          warningsOverridden: conflictsConfirmed && hasConflictWarnings(warnings),
        },
      });

      return { section, warnings };
    });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new CourseManagementError("SECTION_NUMBER_EXISTS");
    }
    throw error;
  }
}

export async function previewSectionUpdate(
  actorId: string,
  courseId: string,
  sectionId: string,
  input: unknown,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const course = uuidSchema.parse(courseId);
  const target = uuidSchema.parse(sectionId);
  const data = parseSectionInput(input);

  return database.$transaction(async (transaction) => {
    await lockCourseManagementAccess(transaction, actor, course, "SHARE");
    const section = await transaction.section.findFirst({
      where: { id: target, courseId: course },
    });
    if (!section) throw new CourseManagementError("SECTION_NOT_FOUND");
    assertCapacityNotDecreased(section.capacity, data.capacity);
    await assertResponsibleAdminAssigned(
      transaction,
      course,
      data.responsibleAdminId,
    );
    return buildSectionWarnings(transaction, data, section);
  });
}

export async function updateSection(
  actorId: string,
  courseId: string,
  sectionId: string,
  input: unknown,
  expectedUpdatedAt: unknown,
  database: DatabaseClient = db,
) {
  return executeUpdateSection(
    actorId,
    courseId,
    sectionId,
    input,
    expectedUpdatedAt,
    false,
    database,
  );
}

export async function confirmUpdateSection(
  actorId: string,
  courseId: string,
  sectionId: string,
  input: unknown,
  expectedUpdatedAt: unknown,
  database: DatabaseClient = db,
) {
  return executeUpdateSection(
    actorId,
    courseId,
    sectionId,
    input,
    expectedUpdatedAt,
    true,
    database,
  );
}

async function executeUpdateSection(
  actorId: string,
  courseId: string,
  sectionId: string,
  input: unknown,
  expectedUpdatedAt: unknown,
  conflictsConfirmed: boolean,
  database: DatabaseClient,
) {
  const actor = uuidSchema.parse(actorId);
  const course = uuidSchema.parse(courseId);
  const target = uuidSchema.parse(sectionId);
  const data = parseSectionInput(input);
  const expectedVersion = parseExpectedUpdatedAt(expectedUpdatedAt);

  try {
    return await database.$transaction(async (transaction) => {
      await lockCourseManagementAccess(transaction, actor, course, "SHARE");
      const sections = await lockSectionsForUpdate(transaction, [target]);
      const current = sections.find(
        (section) => section.id === target && section.courseId === course,
      );
      if (!current) throw new CourseManagementError("SECTION_NOT_FOUND");
      if (current.updatedAt.getTime() !== expectedVersion.getTime()) {
        throw new CourseManagementError("STALE_SECTION_EDIT");
      }

      assertCapacityNotDecreased(current.capacity, data.capacity);
      await assertResponsibleAdminAssigned(
        transaction,
        course,
        data.responsibleAdminId,
      );
      const warnings = await buildSectionWarnings(transaction, data, current);
      if (!conflictsConfirmed && hasConflictWarnings(warnings)) {
        throw new CourseManagementError(
          "CONFLICT_CONFIRMATION_REQUIRED",
          warnings,
        );
      }

      const databaseNow = await getDatabaseNow(transaction);
      const updatedAt = new Date(
        Math.max(databaseNow.getTime(), current.updatedAt.getTime() + 1),
      );
      const section = await transaction.section.update({
        where: { id: target },
        data: { ...data, updatedAt },
      });
      await writeAuditLog(transaction, {
        actorId: actor,
        courseId: course,
        action: AUDIT_ACTIONS.SECTION_UPDATED,
        entityType: "Section",
        entityId: target,
        metadata: {
          changedFields: changedSectionFields(current, section),
          warningsOverridden: conflictsConfirmed && hasConflictWarnings(warnings),
        },
      });

      return { section, warnings };
    });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new CourseManagementError("SECTION_NUMBER_EXISTS");
    }
    throw error;
  }
}

export async function setSectionPublication(
  actorId: string,
  courseId: string,
  sectionId: string,
  isPublished: boolean,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const course = uuidSchema.parse(courseId);
  const target = uuidSchema.parse(sectionId);

  return database.$transaction(async (transaction) => {
    await lockCourseManagementAccess(transaction, actor, course, "SHARE");
    const sections = await lockSectionsForUpdate(transaction, [target]);
    const current = sections.find(
      (section) => section.id === target && section.courseId === course,
    );
    if (!current) throw new CourseManagementError("SECTION_NOT_FOUND");

    const section = await transaction.section.update({
      where: { id: target },
      data: { isPublished },
    });
    await writeAuditLog(transaction, {
      actorId: actor,
      courseId: course,
      action: isPublished
        ? AUDIT_ACTIONS.SECTION_PUBLISHED
        : AUDIT_ACTIONS.SECTION_UNPUBLISHED,
      entityType: "Section",
      entityId: target,
    });
    return section;
  });
}

export async function previewSectionDeletion(
  actorId: string,
  courseId: string,
  sectionId: string,
  inputTransfers: unknown,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const course = uuidSchema.parse(courseId);
  const source = uuidSchema.parse(sectionId);
  const transfers = parseTransfers(inputTransfers);

  return database.$transaction(async (transaction) => {
    await lockCourseManagementAccess(transaction, actor, course, "SHARE");
    const sourceSection = await transaction.section.findFirst({
      where: { id: source, courseId: course },
    });
    if (!sourceSection) throw new CourseManagementError("SECTION_NOT_FOUND");
    const targetIds = [...new Set(transfers.map((item) => item.targetSectionId))];
    const targets = await transaction.section.findMany({
      where: { id: { in: targetIds }, courseId: course },
    });
    return buildDeletionPlan(
      transaction,
      sourceSection,
      targets,
      transfers,
      actor,
    );
  });
}

export async function confirmDeleteSection(
  actorId: string,
  courseId: string,
  sectionId: string,
  inputTransfers: unknown,
  inputReviewedStateToken: unknown,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const course = uuidSchema.parse(courseId);
  const source = uuidSchema.parse(sectionId);
  const transfers = parseTransfers(inputTransfers);
  const reviewedStateToken =
    typeof inputReviewedStateToken === "string" ? inputReviewedStateToken : "";
  const targetIds = [...new Set(transfers.map((item) => item.targetSectionId))];

  return database.$transaction(async (transaction) => {
    await lockCourseManagementAccess(transaction, actor, course, "SHARE");
    const sections = await lockSectionsForUpdate(transaction, [source, ...targetIds]);
    const sourceSection = sections.find(
      (section) => section.id === source && section.courseId === course,
    );
    if (!sourceSection) throw new CourseManagementError("SECTION_NOT_FOUND");
    const targets = sections.filter((section) => section.id !== source);
    await lockSectionRegistrationsForUpdate(transaction, [source, ...targetIds]);
    const plan = await buildDeletionPlan(
      transaction,
      sourceSection,
      targets,
      transfers,
      actor,
    );
    if (
      !deletionReviewTokenMatches(
        deletionReviewState(actor, sourceSection, plan),
        reviewedStateToken,
      )
    ) {
      throw new CourseManagementError("DELETION_CONFIRMATION_REQUIRED", plan);
    }

    for (const transfer of transfers) {
      await transaction.sectionRegistration.update({
        where: {
          studentId_courseId: {
            studentId: transfer.studentId,
            courseId: course,
          },
        },
        data: { sectionId: transfer.targetSectionId },
      });
    }
    const removed = await transaction.sectionRegistration.deleteMany({
      where: { sectionId: source },
    });
    await transaction.section.delete({ where: { id: source } });

    if (transfers.length > 0) {
      await writeAuditLog(transaction, {
        actorId: actor,
        courseId: course,
        action: AUDIT_ACTIONS.SECTION_STUDENTS_TRANSFERRED,
        entityType: "Section",
        entityId: source,
        metadata: {
          transferCount: transfers.length,
          targetCounts: plan.targetCounts,
          warningsOverridden: plan.studentConflicts.length > 0,
        },
      });
    }
    await writeAuditLog(transaction, {
      actorId: actor,
      courseId: course,
      action: AUDIT_ACTIONS.SECTION_DELETED,
      entityType: "Section",
      entityId: source,
      metadata: {
        sectionNumber: sourceSection.sectionNumber,
        transferredRegistrationCount: transfers.length,
        removedRegistrationCount: removed.count,
      },
    });

    return {
      transferredCount: transfers.length,
      removedCount: removed.count,
      warnings: {
        ...emptyConflictPreview(),
        studentConflicts: plan.studentConflicts,
      },
    };
  });
}

async function buildSectionWarnings(
  transaction: Prisma.TransactionClient,
  input: SectionInput,
  current?: LockedSection | { id: string; day: SectionInput["day"]; startMinute: number; endMinute: number },
): Promise<ConflictPreview> {
  const operational = await findOperationalConflicts(
    transaction,
    input,
    current?.id,
  );
  const timeChanged =
    current &&
    (current.day !== input.day ||
      current.startMinute !== input.startMinute ||
      current.endMinute !== input.endMinute);
  const studentConflicts = timeChanged
    ? await findStudentConflictsForSectionEdit(transaction, current.id, input)
    : [];

  return { ...operational, studentConflicts };
}

async function buildDeletionPlan(
  transaction: Prisma.TransactionClient,
  source: DeletionSection,
  targetSections: DeletionSection[],
  transfers: StudentTransfer[],
  actorId: string,
) {
  const normalizedTransfers = [...transfers].sort((first, second) =>
    compareIds(
      `${first.studentId}:${first.targetSectionId}`,
      `${second.studentId}:${second.targetSectionId}`,
    ),
  );
  const targetIds = [
    ...new Set(normalizedTransfers.map((item) => item.targetSectionId)),
  ].sort(compareIds);
  if (targetIds.includes(source.id)) {
    throw new CourseManagementError("INVALID_TRANSFER_TARGET");
  }
  const targetById = new Map(targetSections.map((section) => [section.id, section]));
  if (targetIds.some((id) => !targetById.has(id))) {
    throw new CourseManagementError("INVALID_TRANSFER_TARGET");
  }
  if (
    [...targetById.values()].some((section) => section.courseId !== source.courseId)
  ) {
    throw new CourseManagementError("INVALID_TRANSFER_TARGET");
  }

  const sourceRegistrations = await transaction.sectionRegistration.findMany({
    where: { sectionId: source.id },
    select: {
      studentId: true,
      enrollment: {
        select: {
          student: { select: { fullName: true, universityId: true } },
        },
      },
    },
    orderBy: { studentId: "asc" },
  });
  const sourceStudents = new Set(
    sourceRegistrations.map((registration) => registration.studentId),
  );
  if (
    normalizedTransfers.some(
      (transfer) => !sourceStudents.has(transfer.studentId),
    )
  ) {
    throw new CourseManagementError("TRANSFER_STUDENT_NOT_IN_SOURCE");
  }
  const transferredStudents = new Set(
    normalizedTransfers.map((transfer) => transfer.studentId),
  );
  const removals = sourceRegistrations
    .filter((registration) => !transferredStudents.has(registration.studentId))
    .map((registration) => ({
      studentId: registration.studentId,
      studentName: registration.enrollment.student.fullName,
      universityId: registration.enrollment.student.universityId,
    }));

  const targetCounts: Array<
    DeletionReviewState["targetCounts"][number] & { sectionNumber: number }
  > = [];
  for (const targetSectionId of targetIds) {
    const transferCount = normalizedTransfers.filter(
      (transfer) => transfer.targetSectionId === targetSectionId,
    ).length;
    const currentRegistrationCount = await transaction.sectionRegistration.count({
      where: { sectionId: targetSectionId },
    });
    const target = targetById.get(targetSectionId)!;
    const projectedRegistrationCount = currentRegistrationCount + transferCount;
    if (projectedRegistrationCount > target.capacity) {
      throw new CourseManagementError("TARGET_SECTION_FULL");
    }
    targetCounts.push({
      targetSectionId,
      sectionNumber: target.sectionNumber,
      transferCount,
      currentRegistrationCount,
      projectedRegistrationCount,
      capacity: target.capacity,
    });
  }

  const studentConflicts = await findStudentTransferConflicts(
    transaction,
    source.id,
    normalizedTransfers,
    targetById,
  );

  const plan = {
    transfers: normalizedTransfers,
    removals,
    transferCount: normalizedTransfers.length,
    removalCount: removals.length,
    targetCounts,
    studentConflicts,
  };
  return {
    ...plan,
    reviewedStateToken: createDeletionReviewToken(
      deletionReviewState(actorId, source, plan),
    ),
  };
}

function deletionReviewState(
  actorId: string,
  source: DeletionSection,
  plan: {
    transfers: StudentTransfer[];
    removals: DeletionReviewState["removals"];
    targetCounts: DeletionReviewState["targetCounts"];
    studentConflicts: ConflictPreview["studentConflicts"];
  },
): DeletionReviewState {
  return {
    actorId,
    courseId: source.courseId,
    sourceSectionId: source.id,
    transfers: plan.transfers,
    removals: plan.removals,
    targetCounts: plan.targetCounts,
    studentConflicts: plan.studentConflicts,
  };
}

async function assertResponsibleAdminAssigned(
  transaction: Prisma.TransactionClient,
  courseId: string,
  adminId: string,
) {
  const assignment = await transaction.courseAdmin.findUnique({
    where: { courseId_adminId: { courseId, adminId } },
    select: { adminId: true },
  });
  if (!assignment) {
    throw new CourseManagementError("RESPONSIBLE_ADMIN_NOT_ASSIGNED");
  }
}

async function lockSectionsForUpdate(
  transaction: Prisma.TransactionClient,
  sectionIds: string[],
) {
  const ids = [...new Set(sectionIds)].sort();
  if (ids.length === 0) return [];

  return transaction.$queryRaw<LockedSection[]>(Prisma.sql`
    SELECT
      id,
      "courseId",
      "sectionNumber",
      "responsibleAdminId",
      day,
      "startMinute",
      "endMinute",
      location,
      capacity,
      "isPublished",
      "updatedAt"
    FROM "Section"
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id
    FOR UPDATE
  `);
}

async function lockSectionRegistrationsForUpdate(
  transaction: Prisma.TransactionClient,
  sectionIds: string[],
) {
  const ids = [...new Set(sectionIds)].sort();
  if (ids.length === 0) return;

  await transaction.$queryRaw(Prisma.sql`
    SELECT id
    FROM "SectionRegistration"
    WHERE "sectionId" IN (${Prisma.join(ids)})
    ORDER BY id
    FOR UPDATE
  `);
}

function assertCapacityNotDecreased(current: number, requested: number) {
  if (requested < current) {
    throw new CourseManagementError("CAPACITY_DECREASE_NOT_ALLOWED");
  }
}

function changedSectionFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  return Object.keys(next).filter((key) => {
    if (key === "updatedAt" || key === "createdAt" || key === "id") return false;
    return previous[key] !== next[key];
  });
}

async function getDatabaseNow(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ now: Date }>>`
    SELECT clock_timestamp() AS now
  `;
  return rows[0]!.now;
}

function isPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function compareIds(first: string, second: string) {
  return first < second ? -1 : first > second ? 1 : 0;
}
