import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { verifyPassword } from "@/server/auth/password";
import { createPrismaClient, db } from "@/server/db";
import {
  createAdminAccount,
  reissueAdminTemporaryPassword,
  setAdminActive,
  setAdminRole,
} from "@/server/super-admin/admin-accounts";
import { bootstrapInitialSuperAdmin } from "@/server/super-admin/bootstrap";
import {
  assignCourseAdmin,
  createCourse,
  setPrimaryCourseAdmin,
  unassignCourseAdmin,
  updateCourse,
} from "@/server/super-admin/courses";
import { SuperAdminError } from "@/server/super-admin/errors";

const firstClient = createPrismaClient();
const secondClient = createPrismaClient();

const courseInput = {
  code: "race101",
  nameAr: "اختبار التزامن",
  nameEn: "Concurrency Testing",
  creditHours: 3,
  registrationOpensAt: "2026-09-20T10:00",
  registrationClosesAt: "2026-09-21T10:00",
  switchingOpensAt: null,
  switchingClosesAt: null,
  registrationPaused: false,
  switchingPaused: false,
};

afterAll(async () => {
  await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
});

describe("Super Admin foundation", () => {
  it("allows exactly one concurrent initial bootstrap", async () => {
    await db.user.updateMany({
      where: { role: UserRole.SUPER_ADMIN },
      data: { role: UserRole.ADMIN },
    });
    const suffix = randomUUID();

    const results = await Promise.allSettled([
      bootstrapInitialSuperAdmin(
        {
          adminName: "Bootstrap One",
          email: `bootstrap-one-${suffix}@example.com`,
        },
        firstClient,
      ),
      bootstrapInitialSuperAdmin(
        {
          adminName: "Bootstrap Two",
          email: `bootstrap-two-${suffix}@example.com`,
        },
        secondClient,
      ),
    ]);
    const successes = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof bootstrapInitialSuperAdmin>>
      > => result.status === "fulfilled",
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatchObject({
      code: "ACTIVE_SUPER_ADMIN_EXISTS",
    } satisfies Partial<SuperAdminError>);
    expect(
      await db.user.count({
        where: { role: UserRole.SUPER_ADMIN, isActive: true },
      }),
    ).toBe(1);

    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        action: AUDIT_ACTIONS.SUPER_ADMIN_BOOTSTRAPPED,
        entityId: successes[0]?.value.superAdmin.id,
      },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(
      successes[0]?.value.temporaryPassword,
    );
  });

  it("creates and manages Admin credentials with atomic audit logs", async () => {
    const actor = await activeSuperAdmin();
    const email = `managed-${randomUUID()}@example.com`;
    const created = await createAdminAccount(actor.id, {
      adminName: "Managed Admin",
      email,
    });

    expect(created.admin).toMatchObject({
      email,
      role: UserRole.ADMIN,
      isActive: true,
      mustChangePassword: true,
    });
    const stored = await db.user.findUniqueOrThrow({
      where: { id: created.admin.id },
    });
    await expect(
      verifyPassword(created.temporaryPassword, stored.passwordHash),
    ).resolves.toBe(true);

    await setAdminRole(actor.id, created.admin.id, UserRole.SUPER_ADMIN);
    await setAdminActive(actor.id, created.admin.id, false);
    await setAdminActive(actor.id, created.admin.id, true);
    const reissued = await reissueAdminTemporaryPassword(
      actor.id,
      created.admin.id,
    );
    await setAdminRole(actor.id, created.admin.id, UserRole.ADMIN);

    expect(reissued.temporaryPassword).not.toBe(created.temporaryPassword);
    const audits = await db.auditLog.findMany({
      where: { entityId: created.admin.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      AUDIT_ACTIONS.ADMIN_CREATED,
      AUDIT_ACTIONS.ADMIN_PROMOTED_TO_SUPER_ADMIN,
      AUDIT_ACTIONS.ADMIN_DEACTIVATED,
      AUDIT_ACTIONS.ADMIN_ACTIVATED,
      AUDIT_ACTIONS.ADMIN_TEMPORARY_PASSWORD_REISSUED,
      AUDIT_ACTIONS.SUPER_ADMIN_DEMOTED_TO_ADMIN,
    ]);
    const serializedAudits = JSON.stringify(audits);
    expect(serializedAudits).not.toContain(created.temporaryPassword);
    expect(serializedAudits).not.toContain(reissued.temporaryPassword);
    expect(serializedAudits).not.toContain(stored.passwordHash);
  });

  it("rejects an Admin name that already contains the display prefix", async () => {
    const actor = await activeSuperAdmin();

    await expect(
      createAdminAccount(actor.id, {
        adminName: "Dr. Prefixed Name",
        email: `prefixed-${randomUUID()}@example.com`,
      }),
    ).rejects.toThrow();
  });

  it("keeps one active Super Admin under competing deactivations", async () => {
    await db.user.updateMany({
      where: { role: UserRole.SUPER_ADMIN },
      data: { role: UserRole.ADMIN },
    });
    const first = await createElevatedUser(UserRole.SUPER_ADMIN);
    const second = await createElevatedUser(UserRole.SUPER_ADMIN);

    const results = await Promise.allSettled([
      setAdminActive(first.id, second.id, false, firstClient),
      setAdminActive(second.id, first.id, false, secondClient),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      await db.user.count({
        where: {
          id: { in: [first.id, second.id] },
          role: UserRole.SUPER_ADMIN,
          isActive: true,
        },
      }),
    ).toBe(1);

    const remaining = await db.user.findFirstOrThrow({
      where: {
        id: { in: [first.id, second.id] },
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      },
    });
    await expect(
      setAdminRole(remaining.id, remaining.id, UserRole.ADMIN),
    ).rejects.toMatchObject({
      code: "LAST_ACTIVE_SUPER_ADMIN",
    } satisfies Partial<SuperAdminError>);
  });

  it("revalidates the acting Super Admin inside course mutations", async () => {
    const student = await createElevatedUser(UserRole.STUDENT);

    await expect(
      createCourse(student.id, {
        ...courseInput,
        code: `DENY${randomUUID().slice(0, 8)}`,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<SuperAdminError>);
  });

  it("manages courses and assignments while preserving one primary Admin", async () => {
    const actor = await activeSuperAdmin();
    const firstAdmin = await createElevatedUser(UserRole.ADMIN);
    const secondAdmin = await createElevatedUser(UserRole.ADMIN);
    const course = await createCourse(actor.id, {
      ...courseInput,
      code: `COURSE${randomUUID().slice(0, 8)}`,
    });

    await updateCourse(actor.id, course.id, {
      ...courseInput,
      code: course.code.toLowerCase(),
      creditHours: 4,
    });
    await assignCourseAdmin(actor.id, course.id, firstAdmin.id);
    await assignCourseAdmin(actor.id, course.id, secondAdmin.id);

    await Promise.all([
      setPrimaryCourseAdmin(actor.id, course.id, firstAdmin.id, firstClient),
      setPrimaryCourseAdmin(actor.id, course.id, secondAdmin.id, secondClient),
    ]);

    expect(
      await db.courseAdmin.count({
        where: { courseId: course.id, isPrimary: true },
      }),
    ).toBe(1);
    await unassignCourseAdmin(actor.id, course.id, secondAdmin.id);
    const actions = await db.auditLog.findMany({
      where: { courseId: course.id },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        AUDIT_ACTIONS.COURSE_CREATED,
        AUDIT_ACTIONS.COURSE_UPDATED,
        AUDIT_ACTIONS.COURSE_ADMIN_ASSIGNED,
        AUDIT_ACTIONS.COURSE_ADMIN_UNASSIGNED,
        AUDIT_ACTIONS.COURSE_PRIMARY_ADMIN_CHANGED,
      ]),
    );
  });

  it("rejects assigning a Student as a course Admin", async () => {
    const actor = await activeSuperAdmin();
    const student = await createElevatedUser(UserRole.STUDENT);
    const course = await createCourse(actor.id, {
      ...courseInput,
      code: `INVALID${randomUUID().slice(0, 8)}`,
    });

    await expect(
      assignCourseAdmin(actor.id, course.id, student.id),
    ).rejects.toMatchObject({
      code: "INVALID_ASSIGNEE_ROLE",
    } satisfies Partial<SuperAdminError>);
  });
});

async function activeSuperAdmin() {
  const existing = await db.user.findFirst({
    where: {
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
    },
  });

  return existing ?? createElevatedUser(UserRole.SUPER_ADMIN);
}

async function createElevatedUser(role: UserRole) {
  const suffix = randomUUID();

  const user = await db.user.create({
    data: {
      adminName: role === UserRole.STUDENT ? null : `${role} Test User`,
      email: `${role.toLowerCase()}-${suffix}@example.com`,
      passwordHash:
        "$2b$12$o.suRJmHqKH.vPofp/RnT.pcvzQVYKsZ3CvXutZ9wXcF7dqBPIpEm",
      role,
      isActive: true,
      mustChangePassword: false,
    },
  });
  if (role === UserRole.STUDENT) {
    await db.student.create({
      data: {
        userId: user.id,
        fullName: "Student Test User",
        universityId: `STUDENT-${suffix}`,
        completedCreditHours: 0,
        isTransferredThisYear: false,
      },
    });
  }
  return user;
}
