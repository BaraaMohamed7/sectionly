import { Prisma } from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { lockCourseManagementAccess } from "@/server/course-management/authorization";
import { CourseManagementError } from "@/server/course-management/errors";
import {
  parseResumeMode,
  parseWindowInput,
  parseWindowType,
  uuidSchema,
  type ResumeMode,
  type WindowType,
} from "@/server/course-management/validation";
import { db, type DatabaseClient } from "@/server/db";
import { writeAuditLog } from "@/server/write-audit-log";

const courseWindowSelect = {
  id: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  registrationPaused: true,
  registrationPausedAt: true,
  switchingOpensAt: true,
  switchingClosesAt: true,
  switchingPaused: true,
  switchingPausedAt: true,
} satisfies Prisma.CourseSelect;

export async function updateCourseWindow(
  actorId: string,
  courseId: string,
  inputType: unknown,
  input: unknown,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const courseIdValue = uuidSchema.parse(courseId);
  const type = parseWindowType(inputType);
  const window = parseWindowInput(input);

  return database.$transaction(async (transaction) => {
    await lockCourseManagementAccess(
      transaction,
      actor,
      courseIdValue,
      "UPDATE",
    );
    const current = await transaction.course.findUniqueOrThrow({
      where: { id: courseIdValue },
      select: courseWindowSelect,
    });
    const clearingWindow = window.opensAt === null;
    if (clearingWindow && isPaused(current, type)) {
      throw new CourseManagementError("PAUSED_WINDOW_CANNOT_BE_CLEARED");
    }
    const data =
      type === "registration"
        ? {
            registrationOpensAt: window.opensAt,
            registrationClosesAt: window.closesAt,
            registrationPaused: current.registrationPaused,
            registrationPausedAt: current.registrationPausedAt,
          }
        : {
            switchingOpensAt: window.opensAt,
            switchingClosesAt: window.closesAt,
            switchingPaused: current.switchingPaused,
            switchingPausedAt: current.switchingPausedAt,
          };
    const course = await transaction.course.update({
      where: { id: courseIdValue },
      data,
      select: courseWindowSelect,
    });
    await writeAuditLog(transaction, {
      actorId: actor,
      courseId: courseIdValue,
      action:
        type === "registration"
          ? AUDIT_ACTIONS.REGISTRATION_WINDOW_UPDATED
          : AUDIT_ACTIONS.SWITCHING_WINDOW_UPDATED,
      entityType: "Course",
      entityId: courseIdValue,
      metadata: {
        opensAt: window.opensAt?.toISOString() ?? null,
        closesAt: window.closesAt?.toISOString() ?? null,
        pausePreserved: !clearingWindow && isPaused(current, type),
      },
    });

    return course;
  });
}

export async function pauseCourseWindow(
  actorId: string,
  courseId: string,
  inputType: unknown,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const courseIdValue = uuidSchema.parse(courseId);
  const type = parseWindowType(inputType);

  return database.$transaction(async (transaction) => {
    await lockCourseManagementAccess(
      transaction,
      actor,
      courseIdValue,
      "UPDATE",
    );
    const current = await transaction.course.findUniqueOrThrow({
      where: { id: courseIdValue },
      select: courseWindowSelect,
    });
    assertWindowConfigured(current, type);
    if (isPaused(current, type)) {
      throw new CourseManagementError("WINDOW_ALREADY_PAUSED");
    }
    const pausedAt = await getDatabaseNow(transaction);
    const data =
      type === "registration"
        ? { registrationPaused: true, registrationPausedAt: pausedAt }
        : { switchingPaused: true, switchingPausedAt: pausedAt };
    const course = await transaction.course.update({
      where: { id: courseIdValue },
      data,
      select: courseWindowSelect,
    });
    await writeAuditLog(transaction, {
      actorId: actor,
      courseId: courseIdValue,
      action:
        type === "registration"
          ? AUDIT_ACTIONS.REGISTRATION_PAUSED
          : AUDIT_ACTIONS.SWITCHING_PAUSED,
      entityType: "Course",
      entityId: courseIdValue,
      metadata: { pausedAt: pausedAt.toISOString() },
    });

    return course;
  });
}

export async function resumeCourseWindow(
  actorId: string,
  courseId: string,
  inputType: unknown,
  inputMode: unknown,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const courseIdValue = uuidSchema.parse(courseId);
  const type = parseWindowType(inputType);
  const mode = parseResumeMode(inputMode);

  return database.$transaction(async (transaction) => {
    await lockCourseManagementAccess(
      transaction,
      actor,
      courseIdValue,
      "UPDATE",
    );
    const current = await transaction.course.findUniqueOrThrow({
      where: { id: courseIdValue },
      select: courseWindowSelect,
    });
    assertWindowConfigured(current, type);
    const pausedAt = getPausedAt(current, type);
    if (!isPaused(current, type) || !pausedAt) {
      throw new CourseManagementError("WINDOW_NOT_PAUSED");
    }

    const resumedAt = await getDatabaseNow(transaction);
    const pauseDurationMs = Math.max(0, resumedAt.getTime() - pausedAt.getTime());
    const closesAt = getClosesAt(current, type)!;
    const nextClosesAt =
      mode === "extend"
        ? new Date(closesAt.getTime() + pauseDurationMs)
        : closesAt;
    const data = resumeData(type, mode, nextClosesAt);
    const course = await transaction.course.update({
      where: { id: courseIdValue },
      data,
      select: courseWindowSelect,
    });
    await writeAuditLog(transaction, {
      actorId: actor,
      courseId: courseIdValue,
      action:
        type === "registration"
          ? AUDIT_ACTIONS.REGISTRATION_RESUMED
          : AUDIT_ACTIONS.SWITCHING_RESUMED,
      entityType: "Course",
      entityId: courseIdValue,
      metadata: {
        mode,
        resumedAt: resumedAt.toISOString(),
        pauseDurationMs,
        closesAt: nextClosesAt.toISOString(),
      },
    });

    return { course, resumedAt, pauseDurationMs };
  });
}

function resumeData(type: WindowType, mode: ResumeMode, closesAt: Date) {
  if (type === "registration") {
    return {
      registrationPaused: false,
      registrationPausedAt: null,
      ...(mode === "extend" ? { registrationClosesAt: closesAt } : {}),
    };
  }
  return {
    switchingPaused: false,
    switchingPausedAt: null,
    ...(mode === "extend" ? { switchingClosesAt: closesAt } : {}),
  };
}

function assertWindowConfigured(
  course: Prisma.CourseGetPayload<{ select: typeof courseWindowSelect }>,
  type: WindowType,
) {
  const opensAt =
    type === "registration"
      ? course.registrationOpensAt
      : course.switchingOpensAt;
  if (!opensAt || !getClosesAt(course, type)) {
    throw new CourseManagementError("WINDOW_NOT_CONFIGURED");
  }
}

function isPaused(
  course: Prisma.CourseGetPayload<{ select: typeof courseWindowSelect }>,
  type: WindowType,
) {
  return type === "registration"
    ? course.registrationPaused
    : course.switchingPaused;
}

function getPausedAt(
  course: Prisma.CourseGetPayload<{ select: typeof courseWindowSelect }>,
  type: WindowType,
) {
  return type === "registration"
    ? course.registrationPausedAt
    : course.switchingPausedAt;
}

function getClosesAt(
  course: Prisma.CourseGetPayload<{ select: typeof courseWindowSelect }>,
  type: WindowType,
) {
  return type === "registration"
    ? course.registrationClosesAt
    : course.switchingClosesAt;
}

async function getDatabaseNow(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ now: Date }>>`
    SELECT clock_timestamp() AS now
  `;
  return rows[0]!.now;
}
