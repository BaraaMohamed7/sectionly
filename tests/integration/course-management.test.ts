import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DayOfWeek, UserRole } from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { CourseManagementError } from "@/server/course-management/errors";
import {
  confirmCreateSection,
  confirmDeleteSection,
  confirmUpdateSection,
  createSection,
  previewSectionCreation,
  previewSectionDeletion,
  previewSectionUpdate,
  setSectionPublication,
  updateSection,
} from "@/server/course-management/sections";
import {
  pauseCourseWindow,
  resumeCourseWindow,
  updateCourseWindow,
} from "@/server/course-management/windows";
import { createPrismaClient, db } from "@/server/db";

const firstClient = createPrismaClient();
const secondClient = createPrismaClient();

afterAll(async () => {
  await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.adminNotification.deleteMany();
  await db.announcement.deleteMany();
  await db.sectionRegistration.deleteMany();
  await db.courseEnrollment.deleteMany();
  await db.section.deleteMany();
  await db.courseAdmin.deleteMany();
  await db.course.deleteMany();
  await db.user.deleteMany();
});

describe("course section management", () => {
  it("allows assigned Admins and unassigned Super Admins, but not unassigned Admins", async () => {
    const assigned = await createUser(UserRole.ADMIN);
    const unassigned = await createUser(UserRole.ADMIN);
    const superAdmin = await createUser(UserRole.SUPER_ADMIN);
    const responsible = await createUser(UserRole.ADMIN);
    const firstCourse = await createCourse();
    const secondCourse = await createCourse();
    await assignAdmin(firstCourse.id, assigned.id);
    await assignAdmin(firstCourse.id, responsible.id);
    await assignAdmin(secondCourse.id, responsible.id);

    await expect(
      createSection(assigned.id, firstCourse.id, sectionInput(responsible.id, 1)),
    ).resolves.toMatchObject({ section: { isPublished: false } });
    await expect(
      createSection(unassigned.id, firstCourse.id, sectionInput(responsible.id, 2)),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED_COURSE",
    } satisfies Partial<CourseManagementError>);
    await expect(
      createSection(superAdmin.id, secondCourse.id, {
        ...sectionInput(responsible.id, 1),
        day: DayOfWeek.TUESDAY,
        location: "Room 2",
      }),
    ).resolves.toMatchObject({ section: { courseId: secondCourse.id } });
  });

  it("requires the responsible Admin assignment even for a Super Admin", async () => {
    const superAdmin = await createUser(UserRole.SUPER_ADMIN);
    const course = await createCourse();

    await expect(
      createSection(superAdmin.id, course.id, sectionInput(superAdmin.id, 1)),
    ).rejects.toMatchObject({
      code: "RESPONSIBLE_ADMIN_NOT_ASSIGNED",
    } satisfies Partial<CourseManagementError>);
  });

  it("validates day/time, normalizes location, and starts unpublished", async () => {
    const { actor, responsible, course } = await managementContext();

    await expect(
      createSection(actor.id, course.id, {
        ...sectionInput(responsible.id, 1),
        day: "FRIDAY",
      }),
    ).rejects.toThrow();
    await expect(
      createSection(actor.id, course.id, {
        ...sectionInput(responsible.id, 1),
        startMinute: 470,
      }),
    ).rejects.toThrow();

    const result = await createSection(actor.id, course.id, {
      ...sectionInput(responsible.id, 1),
      location: "  Lab   3  ",
    });
    expect(result.section).toMatchObject({
      location: "Lab 3",
      isPublished: false,
    });
  });

  it("previews responsible-Admin and location conflicts and recomputes on confirmation", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const responsible = await createUser(UserRole.ADMIN);
    const otherResponsible = await createUser(UserRole.ADMIN);
    const firstCourse = await createCourse();
    const secondCourse = await createCourse();
    await assignAdmin(firstCourse.id, responsible.id);
    await assignAdmin(firstCourse.id, otherResponsible.id);
    await assignAdmin(secondCourse.id, responsible.id);
    await assignAdmin(secondCourse.id, otherResponsible.id);
    await createDirectSection(firstCourse.id, responsible.id, {
      sectionNumber: 1,
      day: DayOfWeek.SATURDAY,
      startMinute: 600,
      endMinute: 720,
      location: "Lab 3",
      capacity: 20,
    });
    const input = {
      ...sectionInput(responsible.id, 1),
      day: DayOfWeek.SATURDAY,
      startMinute: 660,
      endMinute: 780,
      location: "lab 3",
    };

    const preview = await previewSectionCreation(actor.id, secondCourse.id, input);
    expect(preview.responsibleAdminConflicts).toHaveLength(1);
    expect(preview.locationConflicts).toHaveLength(1);
    await expect(createSection(actor.id, secondCourse.id, input)).rejects.toMatchObject({
      code: "CONFLICT_CONFIRMATION_REQUIRED",
    } satisfies Partial<CourseManagementError>);

    const newlyConflicting = await createDirectSection(
      firstCourse.id,
      otherResponsible.id,
      {
        sectionNumber: 2,
        day: DayOfWeek.SATURDAY,
        startMinute: 700,
        endMinute: 800,
        location: "Room 8",
        capacity: 20,
      },
    );
    const confirmed = await confirmCreateSection(
      actor.id,
      secondCourse.id,
      { ...input, responsibleAdminId: otherResponsible.id, location: "Room 9" },
    );
    expect(confirmed.warnings.responsibleAdminConflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ sectionId: newlyConflicting.id })]),
    );
  });

  it("previews student schedule conflicts when editing section time", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const responsible = await createUser(UserRole.ADMIN);
    const firstCourse = await createCourse();
    const secondCourse = await createCourse();
    await assignAdmin(firstCourse.id, responsible.id);
    await assignAdmin(secondCourse.id, responsible.id);
    const source = await createDirectSection(firstCourse.id, responsible.id, {
      sectionNumber: 1,
      day: DayOfWeek.SATURDAY,
      startMinute: 480,
      endMinute: 540,
      location: "Room 1",
      capacity: 20,
    });
    const conflicting = await createDirectSection(secondCourse.id, responsible.id, {
      sectionNumber: 1,
      day: DayOfWeek.SUNDAY,
      startMinute: 600,
      endMinute: 720,
      location: "Room 2",
      capacity: 20,
    });
    const student = await createStudent();
    await enrollAndRegister(student.id, firstCourse.id, source.id);
    await enrollAndRegister(student.id, secondCourse.id, conflicting.id);

    const preview = await previewSectionUpdate(
      actor.id,
      firstCourse.id,
      source.id,
      {
        ...sectionInput(responsible.id, 1),
        day: DayOfWeek.SUNDAY,
        startMinute: 660,
        endMinute: 780,
        location: "Room 1",
        capacity: 20,
      },
    );

    expect(preview.studentConflicts).toEqual([
      expect.objectContaining({
        studentId: student.id,
        conflictingSectionId: conflicting.id,
        conflictingCourseCode: secondCourse.code,
      }),
    ]);
  });

  it("allows capacity increases and rejects every decrease", async () => {
    const { actor, responsible, course } = await managementContext();
    const section = await createDirectSection(course.id, responsible.id, {
      sectionNumber: 1,
      day: DayOfWeek.MONDAY,
      startMinute: 600,
      endMinute: 720,
      location: "Room 4",
      capacity: 30,
    });

    const increased = await updateSection(
      actor.id,
      course.id,
      section.id,
      { ...sectionInput(responsible.id, 1), capacity: 40 },
      section.updatedAt,
    );
    expect(increased.section.capacity).toBe(40);

    await expect(
      updateSection(
        actor.id,
        course.id,
        section.id,
        { ...sectionInput(responsible.id, 1), capacity: 20 },
        increased.section.updatedAt,
      ),
    ).rejects.toMatchObject({
      code: "CAPACITY_DECREASE_NOT_ALLOWED",
    } satisfies Partial<CourseManagementError>);
  });

  it("unpublishes without affecting existing registrations", async () => {
    const { actor, responsible, course } = await managementContext();
    const section = await createDirectSection(course.id, responsible.id, {
      sectionNumber: 1,
      day: DayOfWeek.MONDAY,
      startMinute: 600,
      endMinute: 720,
      location: "Room 5",
      capacity: 30,
      isPublished: true,
    });
    const student = await createStudent();
    await enrollAndRegister(student.id, course.id, section.id);

    await setSectionPublication(actor.id, course.id, section.id, false);

    await expect(db.section.findUniqueOrThrow({ where: { id: section.id } })).resolves
      .toMatchObject({ isPublished: false });
    await expect(
      db.sectionRegistration.count({ where: { sectionId: section.id } }),
    ).resolves.toBe(1);
  });

  it("deletes empty and populated sections while preserving CourseEnrollments", async () => {
    const { actor, responsible, course } = await managementContext();
    const empty = await createDirectSection(course.id, responsible.id, {
      sectionNumber: 1,
      day: DayOfWeek.TUESDAY,
      startMinute: 600,
      endMinute: 720,
      location: "Room 6",
      capacity: 30,
    });
    await confirmDeleteSection(actor.id, course.id, empty.id, []);
    await expect(db.section.findUnique({ where: { id: empty.id } })).resolves.toBeNull();

    const populated = await createDirectSection(course.id, responsible.id, {
      sectionNumber: 2,
      day: DayOfWeek.TUESDAY,
      startMinute: 720,
      endMinute: 840,
      location: "Room 7",
      capacity: 30,
    });
    const student = await createStudent();
    await enrollAndRegister(student.id, course.id, populated.id);
    await confirmDeleteSection(actor.id, course.id, populated.id, []);

    await expect(
      db.sectionRegistration.findFirst({ where: { studentId: student.id } }),
    ).resolves.toBeNull();
    await expect(
      db.courseEnrollment.findUnique({
        where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
      }),
    ).resolves.not.toBeNull();
  });

  it("atomically splits transfers across targets before deleting the source", async () => {
    const { actor, responsible, course } = await managementContext();
    const source = await createDirectSection(course.id, responsible.id, sectionData(1, 480));
    const firstTarget = await createDirectSection(
      course.id,
      responsible.id,
      sectionData(2, 600),
    );
    const secondTarget = await createDirectSection(
      course.id,
      responsible.id,
      sectionData(3, 720),
    );
    const students = await Promise.all([
      createStudent(),
      createStudent(),
      createStudent(),
    ]);
    for (const student of students) {
      await enrollAndRegister(student.id, course.id, source.id);
    }
    const transfers = [
      { studentId: students[0]!.id, targetSectionId: firstTarget.id },
      { studentId: students[1]!.id, targetSectionId: secondTarget.id },
    ];

    const preview = await previewSectionDeletion(
      actor.id,
      course.id,
      source.id,
      transfers,
    );
    expect(preview).toMatchObject({ transferCount: 2, removalCount: 1 });
    await confirmDeleteSection(actor.id, course.id, source.id, transfers);

    await expect(registrationSection(students[0]!.id, course.id)).resolves.toBe(
      firstTarget.id,
    );
    await expect(registrationSection(students[1]!.id, course.id)).resolves.toBe(
      secondTarget.id,
    );
    await expect(registrationSection(students[2]!.id, course.id)).resolves.toBeNull();
  });

  it("never bypasses target capacity and rolls back the complete delete transaction", async () => {
    const { actor, responsible, course } = await managementContext();
    const source = await createDirectSection(course.id, responsible.id, sectionData(1, 480));
    const target = await createDirectSection(course.id, responsible.id, {
      ...sectionData(2, 600),
      capacity: 1,
    });
    const students = await Promise.all([createStudent(), createStudent()]);
    for (const student of students) {
      await enrollAndRegister(student.id, course.id, source.id);
    }
    const transfers = students.map((student) => ({
      studentId: student.id,
      targetSectionId: target.id,
    }));

    await expect(
      confirmDeleteSection(actor.id, course.id, source.id, transfers),
    ).rejects.toMatchObject({
      code: "TARGET_SECTION_FULL",
    } satisfies Partial<CourseManagementError>);
    await expect(db.section.findUnique({ where: { id: source.id } })).resolves.not
      .toBeNull();
    await expect(
      db.sectionRegistration.count({ where: { sectionId: source.id } }),
    ).resolves.toBe(2);
    await expect(
      db.auditLog.findFirst({
        where: { entityId: source.id, action: AUDIT_ACTIONS.SECTION_DELETED },
      }),
    ).resolves.toBeNull();
  });

  it("allows explicit override of recomputed transfer schedule warnings", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const responsible = await createUser(UserRole.ADMIN);
    const course = await createCourse();
    const otherCourse = await createCourse();
    await assignAdmin(course.id, responsible.id);
    await assignAdmin(otherCourse.id, responsible.id);
    const source = await createDirectSection(course.id, responsible.id, sectionData(1, 480));
    const target = await createDirectSection(course.id, responsible.id, {
      ...sectionData(2, 600),
      day: DayOfWeek.WEDNESDAY,
    });
    const conflict = await createDirectSection(otherCourse.id, responsible.id, {
      ...sectionData(1, 630),
      day: DayOfWeek.WEDNESDAY,
    });
    const student = await createStudent();
    await enrollAndRegister(student.id, course.id, source.id);
    await enrollAndRegister(student.id, otherCourse.id, conflict.id);
    const transfers = [{ studentId: student.id, targetSectionId: target.id }];

    const preview = await previewSectionDeletion(
      actor.id,
      course.id,
      source.id,
      transfers,
    );
    expect(preview.studentConflicts).toHaveLength(1);

    const result = await confirmDeleteSection(
      actor.id,
      course.id,
      source.id,
      transfers,
    );
    expect(result.warnings.studentConflicts).toHaveLength(1);
    await expect(registrationSection(student.id, course.id)).resolves.toBe(target.id);
  });

  it("rejects stale concurrent section edits atomically", async () => {
    const { actor, responsible, course } = await managementContext();
    const section = await createDirectSection(course.id, responsible.id, sectionData(1, 480));
    const expectedVersion = section.updatedAt;

    const results = await Promise.allSettled([
      confirmUpdateSection(
        actor.id,
        course.id,
        section.id,
        { ...sectionInput(responsible.id, 1), location: "Room A" },
        expectedVersion,
        firstClient,
      ),
      confirmUpdateSection(
        actor.id,
        course.id,
        section.id,
        { ...sectionInput(responsible.id, 1), location: "Room B" },
        expectedVersion,
        secondClient,
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "STALE_SECTION_EDIT" },
    });
  });

  it("serializes concurrent capacity-sensitive transfers into one target", async () => {
    const { actor, responsible, course } = await managementContext();
    const firstSource = await createDirectSection(
      course.id,
      responsible.id,
      sectionData(1, 480),
    );
    const secondSource = await createDirectSection(
      course.id,
      responsible.id,
      sectionData(2, 600),
    );
    const target = await createDirectSection(course.id, responsible.id, {
      ...sectionData(3, 720),
      capacity: 1,
    });
    const firstStudent = await createStudent();
    const secondStudent = await createStudent();
    await enrollAndRegister(firstStudent.id, course.id, firstSource.id);
    await enrollAndRegister(secondStudent.id, course.id, secondSource.id);

    const results = await Promise.allSettled([
      confirmDeleteSection(
        actor.id,
        course.id,
        firstSource.id,
        [{ studentId: firstStudent.id, targetSectionId: target.id }],
        firstClient,
      ),
      confirmDeleteSection(
        actor.id,
        course.id,
        secondSource.id,
        [{ studentId: secondStudent.id, targetSectionId: target.id }],
        secondClient,
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(
      db.sectionRegistration.count({ where: { sectionId: target.id } }),
    ).resolves.toBe(1);
  });
});

describe("course registration and switching windows", () => {
  it("validates pairs and keeps registration and switching independent", async () => {
    const { actor, course } = await managementContext();

    await expect(
      updateCourseWindow(actor.id, course.id, "registration", {
        opensAt: "2026-09-22T12:00",
        closesAt: null,
      }),
    ).rejects.toThrow();

    await updateCourseWindow(actor.id, course.id, "registration", {
      opensAt: "2026-09-22T12:00",
      closesAt: "2026-09-22T14:00",
    });
    const stored = await db.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(stored.registrationOpensAt).not.toBeNull();
    expect(stored.switchingOpensAt).toBeNull();
  });

  it("records pause time and normal resume preserves closesAt", async () => {
    const { actor, course } = await managementContext();
    await updateCourseWindow(actor.id, course.id, "registration", {
      opensAt: "2026-09-22T12:00",
      closesAt: "2026-09-22T18:00",
    });
    const paused = await pauseCourseWindow(actor.id, course.id, "registration");
    expect(paused.registrationPaused).toBe(true);
    expect(paused.registrationPausedAt).toBeInstanceOf(Date);
    const closesAt = paused.registrationClosesAt;

    const resumed = await resumeCourseWindow(
      actor.id,
      course.id,
      "registration",
      "normal",
    );
    expect(resumed.course.registrationPaused).toBe(false);
    expect(resumed.course.registrationPausedAt).toBeNull();
    expect(resumed.course.registrationClosesAt).toEqual(closesAt);
  });

  it("resume plus extend adds the actual database pause duration", async () => {
    const { actor, course } = await managementContext();
    await updateCourseWindow(actor.id, course.id, "switching", {
      opensAt: "2026-09-22T12:00",
      closesAt: "2026-09-22T18:00",
    });
    await pauseCourseWindow(actor.id, course.id, "switching");
    const oldPausedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.course.update({
      where: { id: course.id },
      data: { switchingPausedAt: oldPausedAt },
    });
    const before = await db.course.findUniqueOrThrow({ where: { id: course.id } });

    const resumed = await resumeCourseWindow(
      actor.id,
      course.id,
      "switching",
      "extend",
    );

    expect(resumed.course.switchingClosesAt?.getTime()).toBe(
      before.switchingClosesAt!.getTime() + resumed.pauseDurationMs,
    );
    expect(resumed.pauseDurationMs).toBe(
      resumed.resumedAt.getTime() - oldPausedAt.getTime(),
    );
  });

  it("preserves pause start when a paused window is edited and audits success only", async () => {
    const { actor, course } = await managementContext();
    await updateCourseWindow(actor.id, course.id, "registration", {
      opensAt: "2026-09-22T12:00",
      closesAt: "2026-09-22T18:00",
    });
    const paused = await pauseCourseWindow(actor.id, course.id, "registration");
    await updateCourseWindow(actor.id, course.id, "registration", {
      opensAt: "2026-09-22T13:00",
      closesAt: "2026-09-22T20:00",
    });
    const edited = await db.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(edited.registrationPausedAt).toEqual(paused.registrationPausedAt);

    await expect(
      updateCourseWindow(actor.id, course.id, "registration", {
        opensAt: null,
        closesAt: null,
      }),
    ).rejects.toMatchObject({
      code: "PAUSED_WINDOW_CANNOT_BE_CLEARED",
    } satisfies Partial<CourseManagementError>);

    await expect(
      pauseCourseWindow(actor.id, course.id, "registration"),
    ).rejects.toMatchObject({ code: "WINDOW_ALREADY_PAUSED" });
    await expect(
      db.auditLog.count({
        where: { courseId: course.id, action: AUDIT_ACTIONS.REGISTRATION_PAUSED },
      }),
    ).resolves.toBe(1);
  });
});

async function managementContext() {
  const actor = await createUser(UserRole.ADMIN);
  const responsible = await createUser(UserRole.ADMIN);
  const course = await createCourse();
  await assignAdmin(course.id, actor.id);
  await assignAdmin(course.id, responsible.id);
  return { actor, responsible, course };
}

function sectionInput(responsibleAdminId: string, sectionNumber: number) {
  return {
    sectionNumber,
    responsibleAdminId,
    day: DayOfWeek.MONDAY,
    startMinute: 600,
    endMinute: 720,
    location: "Room 1",
    capacity: 30,
  };
}

function sectionData(sectionNumber: number, startMinute: number) {
  return {
    sectionNumber,
    day: DayOfWeek.THURSDAY,
    startMinute,
    endMinute: startMinute + 60,
    location: `Room ${sectionNumber}`,
    capacity: 30,
  };
}

async function createUser(role: UserRole) {
  const suffix = randomUUID();
  return db.user.create({
    data: {
      fullName: `${role} Course Manager`,
      email: `manager-${suffix}@example.com`,
      passwordHash:
        "$2b$12$o.suRJmHqKH.vPofp/RnT.pcvzQVYKsZ3CvXutZ9wXcF7dqBPIpEm",
      role,
      isActive: true,
      mustChangePassword: false,
      universityId: role === UserRole.STUDENT ? `STUDENT-${suffix}` : null,
      completedCreditHours: role === UserRole.STUDENT ? 0 : null,
      isTransferredThisYear: role === UserRole.STUDENT ? false : null,
      onboardingCompletedAt: role === UserRole.STUDENT ? new Date() : null,
    },
  });
}

function createStudent() {
  return createUser(UserRole.STUDENT);
}

async function createCourse() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return db.course.create({
    data: {
      code: `CM${suffix}`,
      nameAr: "مقرر إدارة الشعب",
      nameEn: `Course Management ${suffix}`,
      creditHours: 3,
    },
  });
}

function assignAdmin(courseId: string, adminId: string) {
  return db.courseAdmin.create({ data: { courseId, adminId } });
}

async function createDirectSection(
  courseId: string,
  responsibleAdminId: string,
  data: {
    sectionNumber: number;
    day: DayOfWeek;
    startMinute: number;
    endMinute: number;
    location: string;
    capacity: number;
    isPublished?: boolean;
  },
) {
  return db.section.create({
    data: { courseId, responsibleAdminId, ...data },
  });
}

async function enrollAndRegister(
  studentId: string,
  courseId: string,
  sectionId: string,
) {
  await db.courseEnrollment.create({ data: { studentId, courseId } });
  await db.sectionRegistration.create({
    data: { studentId, courseId, sectionId },
  });
}

async function registrationSection(studentId: string, courseId: string) {
  return (
    await db.sectionRegistration.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: { sectionId: true },
    })
  )?.sectionId ?? null;
}
