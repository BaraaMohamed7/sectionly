import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  StudentLinkClaimStatus,
  UserRole,
} from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { createPrismaClient, db } from "@/server/db";
import { completeStudentProfile, StudentProfileError } from "@/server/student-profile";
import { getStudentCourseOverview } from "@/server/student-courses/service";
import { SuperAdminError } from "@/server/super-admin/errors";
import { resolveStudentLinkClaim } from "@/server/super-admin/student-links";

const firstClient = createPrismaClient();
const secondClient = createPrismaClient();
const passwordHash =
  "$2b$12$o.suRJmHqKH.vPofp/RnT.pcvzQVYKsZ3CvXutZ9wXcF7dqBPIpEm";

afterAll(async () => {
  await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
});

describe("Student identity", () => {
  it("completes the linked academic profile and audits User and Student IDs separately", async () => {
    const { user, student } = await createLinkedStudent({ complete: false });

    const updated = await completeStudentProfile(user.id, {
      completedCreditHours: 66,
      isTransferredThisYear: true,
    });

    expect(user.id).not.toBe(student.id);
    expect(updated).toMatchObject({
      id: student.id,
      completedCreditHours: 66,
      isTransferredThisYear: true,
    });
    await expect(
      db.auditLog.findFirstOrThrow({
        where: {
          actorId: user.id,
          action: AUDIT_ACTIONS.STUDENT_PROFILE_COMPLETED,
        },
      }),
    ).resolves.toMatchObject({
      entityType: "Student",
      entityId: student.id,
    });
  });

  it("does not complete an unlinked account", async () => {
    const user = await createUser(UserRole.STUDENT);

    await expect(
      completeStudentProfile(user.id, {
        completedCreditHours: 10,
        isTransferredThisYear: false,
      }),
    ).rejects.toMatchObject({
      code: "STUDENT_LINK_REQUIRED",
    } satisfies Partial<StudentProfileError>);
    await expect(
      db.auditLog.findFirst({
        where: {
          actorId: user.id,
          action: AUDIT_ACTIONS.STUDENT_PROFILE_COMPLETED,
        },
      }),
    ).resolves.toBeNull();
  });

  it("records profile completion once when two submissions race", async () => {
    const { user, student } = await createLinkedStudent({ complete: false });

    const results = await Promise.all([
      completeStudentProfile(
        user.id,
        { completedCreditHours: 32, isTransferredThisYear: false },
        firstClient,
      ),
      completeStudentProfile(
        user.id,
        { completedCreditHours: 66, isTransferredThisYear: true },
        secondClient,
      ),
    ]);

    expect(results[0]).toMatchObject(results[1]!);
    expect(
      await db.auditLog.count({
        where: {
          actorId: user.id,
          entityId: student.id,
          action: AUDIT_ACTIONS.STUDENT_PROFILE_COMPLETED,
        },
      }),
    ).toBe(1);
  });

  it("approves a claim without moving academic records to the User ID", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent();
    const course = await createCourse();
    await db.courseEnrollment.create({
      data: { studentId: student.id, courseId: course.id },
    });
    const claim = await createClaim(student.id, requester.id);

    await resolveStudentLinkClaim(actor.id, claim.id, "approve");

    await expect(
      db.student.findUniqueOrThrow({ where: { id: student.id } }),
    ).resolves.toMatchObject({ userId: requester.id });
    await expect(
      db.courseEnrollment.findUnique({
        where: {
          studentId_courseId: { studentId: student.id, courseId: course.id },
        },
      }),
    ).resolves.not.toBeNull();
    await expect(
      db.courseEnrollment.findUnique({
        where: {
          studentId_courseId: { studentId: requester.id, courseId: course.id },
        },
      }),
    ).resolves.toBeNull();
    await expect(
      db.auditLog.findFirstOrThrow({
        where: {
          actorId: actor.id,
          entityId: claim.id,
          action: AUDIT_ACTIONS.STUDENT_LINK_CLAIM_APPROVED,
        },
      }),
    ).resolves.toMatchObject({ entityType: "StudentLinkClaim" });
  });

  it("fills only missing profile fields from an approved claim", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent({
      fullName: "Authoritative Ahmed Mohamed",
      completedCreditHours: null,
      isTransferredThisYear: null,
    });
    const claim = await createClaim(student.id, requester.id, {
      proposedFullName: "Ahmed M. Mohamed",
      proposedCompletedCreditHours: 65,
      proposedIsTransferredThisYear: false,
    });

    await resolveStudentLinkClaim(actor.id, claim.id, "approve");

    await expect(
      db.student.findUniqueOrThrow({ where: { id: student.id } }),
    ).resolves.toMatchObject({
      fullName: "Authoritative Ahmed Mohamed",
      completedCreditHours: 65,
      isTransferredThisYear: false,
      userId: requester.id,
    });
    await expect(getStudentCourseOverview(requester.id)).resolves.toMatchObject({
      totalCreditHours: 0,
    });
    await expect(
      db.auditLog.findFirstOrThrow({
        where: {
          entityId: claim.id,
          action: AUDIT_ACTIONS.STUDENT_LINK_CLAIM_APPROVED,
        },
      }),
    ).resolves.toMatchObject({
      metadata: {
        profileFieldsPopulatedFromClaim: {
          completedCreditHours: true,
          isTransferredThisYear: true,
        },
      },
    });
  });

  it("preserves non-null authoritative profile fields during approval", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent({
      fullName: "Existing Authoritative Name",
      completedCreditHours: 90,
      isTransferredThisYear: true,
    });
    const claim = await createClaim(student.id, requester.id, {
      proposedFullName: "Different Submitted Name",
      proposedCompletedCreditHours: 12,
      proposedIsTransferredThisYear: false,
    });

    await resolveStudentLinkClaim(actor.id, claim.id, "approve");

    await expect(
      db.student.findUniqueOrThrow({ where: { id: student.id } }),
    ).resolves.toMatchObject({
      fullName: "Existing Authoritative Name",
      completedCreditHours: 90,
      isTransferredThisYear: true,
      userId: requester.id,
    });
    await expect(
      db.auditLog.findFirstOrThrow({
        where: {
          entityId: claim.id,
          action: AUDIT_ACTIONS.STUDENT_LINK_CLAIM_APPROVED,
        },
      }),
    ).resolves.toMatchObject({
      metadata: {
        profileFieldsPopulatedFromClaim: {
          completedCreditHours: false,
          isTransferredThisYear: false,
        },
      },
    });
  });

  it("preserves profile fields populated before approval acquires the Student lock", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent({
      completedCreditHours: null,
      isTransferredThisYear: null,
    });
    const claim = await createClaim(student.id, requester.id, {
      proposedCompletedCreditHours: 12,
      proposedIsTransferredThisYear: false,
    });
    let releaseStudentLock!: () => void;
    let reportStudentLock!: () => void;
    const studentLockHeld = new Promise<void>((resolve) => {
      reportStudentLock = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseStudentLock = resolve;
    });
    const concurrentProfileUpdate = firstClient.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM "Student"
        WHERE id = ${student.id}::uuid
        FOR UPDATE
      `;
      reportStudentLock();
      await release;
      await transaction.student.update({
        where: { id: student.id },
        data: {
          completedCreditHours: 77,
          isTransferredThisYear: true,
        },
      });
    });
    await studentLockHeld;

    const approval = resolveStudentLinkClaim(
      actor.id,
      claim.id,
      "approve",
      secondClient,
    );
    let lockWaitError: unknown;
    try {
      await waitForStudentLockWait();
    } catch (error) {
      lockWaitError = error;
    } finally {
      releaseStudentLock();
    }
    await Promise.all([concurrentProfileUpdate, approval]);
    if (lockWaitError) throw lockWaitError;

    await expect(
      db.student.findUniqueOrThrow({ where: { id: student.id } }),
    ).resolves.toMatchObject({
      completedCreditHours: 77,
      isTransferredThisYear: true,
      userId: requester.id,
    });
  });

  it("allows only a Super Admin to approve a claim", async () => {
    const actor = await createUser(UserRole.ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent({
      fullName: "Rejected Authoritative Name",
      completedCreditHours: null,
      isTransferredThisYear: null,
    });
    const claim = await createClaim(student.id, requester.id, {
      proposedFullName: "Rejected Proposed Name",
      proposedCompletedCreditHours: 42,
      proposedIsTransferredThisYear: true,
    });

    await expect(
      resolveStudentLinkClaim(actor.id, claim.id, "approve"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<SuperAdminError>);
    await expect(
      db.studentLinkClaim.findUniqueOrThrow({ where: { id: claim.id } }),
    ).resolves.toMatchObject({ status: StudentLinkClaimStatus.PENDING });
    await expect(
      db.student.findUniqueOrThrow({ where: { id: student.id } }),
    ).resolves.toMatchObject({
      fullName: "Rejected Authoritative Name",
      completedCreditHours: null,
      isTransferredThisYear: null,
      userId: null,
    });
    await expect(
      db.studentLinkClaim.findUniqueOrThrow({ where: { id: claim.id } }),
    ).resolves.toMatchObject({
      proposedFullName: "Rejected Proposed Name",
      proposedCompletedCreditHours: 42,
      proposedIsTransferredThisYear: true,
    });
  });

  it("links a historical claim without proposals and leaves the profile incomplete", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent({
      completedCreditHours: null,
      isTransferredThisYear: null,
    });
    const claim = await createClaim(student.id, requester.id, {
      proposedFullName: null,
      proposedCompletedCreditHours: null,
      proposedIsTransferredThisYear: null,
    });

    await resolveStudentLinkClaim(actor.id, claim.id, "approve");

    await expect(
      db.student.findUniqueOrThrow({ where: { id: student.id } }),
    ).resolves.toMatchObject({
      completedCreditHours: null,
      isTransferredThisYear: null,
      userId: requester.id,
    });
    await expect(getStudentCourseOverview(requester.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("revalidates approval eligibility but still permits rejection", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent({
      fullName: "Rejected Student Record",
      completedCreditHours: null,
      isTransferredThisYear: null,
    });
    const claim = await createClaim(student.id, requester.id, {
      proposedFullName: "Rejected Submitted Name",
      proposedCompletedCreditHours: 42,
      proposedIsTransferredThisYear: true,
    });
    await db.user.update({
      where: { id: requester.id },
      data: { isActive: false },
    });

    await expect(
      resolveStudentLinkClaim(actor.id, claim.id, "approve"),
    ).rejects.toMatchObject({
      code: "INVALID_STUDENT_LINK_USER",
    } satisfies Partial<SuperAdminError>);
    await resolveStudentLinkClaim(actor.id, claim.id, "reject");

    await expect(
      db.studentLinkClaim.findUniqueOrThrow({ where: { id: claim.id } }),
    ).resolves.toMatchObject({
      status: StudentLinkClaimStatus.REJECTED,
      resolvedById: actor.id,
    });
    await expect(
      db.user.findUnique({ where: { id: requester.id } }),
    ).resolves.not.toBeNull();
    await expect(
      db.student.findUniqueOrThrow({ where: { id: student.id } }),
    ).resolves.toMatchObject({
      fullName: "Rejected Student Record",
      completedCreditHours: null,
      isTransferredThisYear: null,
      userId: null,
    });
    await expect(
      db.studentLinkClaim.findUniqueOrThrow({ where: { id: claim.id } }),
    ).resolves.toMatchObject({
      proposedFullName: "Rejected Submitted Name",
      proposedCompletedCreditHours: 42,
      proposedIsTransferredThisYear: true,
    });
  });

  it("serializes concurrent decisions so exactly one resolution commits", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent();
    const claim = await createClaim(student.id, requester.id);

    const results = await Promise.allSettled([
      resolveStudentLinkClaim(actor.id, claim.id, "approve", firstClient),
      resolveStudentLinkClaim(actor.id, claim.id, "reject", secondClient),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      await db.auditLog.count({
        where: {
          entityId: claim.id,
          action: {
            in: [
              AUDIT_ACTIONS.STUDENT_LINK_CLAIM_APPROVED,
              AUDIT_ACTIONS.STUDENT_LINK_CLAIM_REJECTED,
            ],
          },
        },
      }),
    ).toBe(1);
    const resolved = await db.studentLinkClaim.findUniqueOrThrow({
      where: { id: claim.id },
    });
    expect(resolved.status).not.toBe(StudentLinkClaimStatus.PENDING);
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
  });

  it("enforces at most one pending claim per Student and per requesting User", async () => {
    const firstStudent = await createUnlinkedStudent();
    const secondStudent = await createUnlinkedStudent();
    const firstUser = await createUser(UserRole.STUDENT);
    const secondUser = await createUser(UserRole.STUDENT);
    await createClaim(firstStudent.id, firstUser.id);

    await expect(createClaim(firstStudent.id, secondUser.id)).rejects.toThrow();
    await expect(createClaim(secondStudent.id, firstUser.id)).rejects.toThrow();
  });

  it("rejects a negative proposed completed-credit-hour value at the database", async () => {
    const student = await createUnlinkedStudent();
    const user = await createUser(UserRole.STUDENT);

    await expect(
      db.studentLinkClaim.create({
        data: {
          studentId: student.id,
          userId: user.id,
          proposedFullName: "Invalid Proposal",
          proposedCompletedCreditHours: -1,
          proposedIsTransferredThisYear: false,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a partially captured proposed profile at the database", async () => {
    const student = await createUnlinkedStudent();
    const user = await createUser(UserRole.STUDENT);

    await expect(
      db.studentLinkClaim.create({
        data: {
          studentId: student.id,
          userId: user.id,
          proposedFullName: "Partial Proposal",
        },
      }),
    ).rejects.toThrow();
  });
});

async function createUser(role: UserRole) {
  const suffix = randomUUID();
  return db.user.create({
    data: {
      email: `identity-${suffix}@example.com`,
      passwordHash,
      role,
      adminName: role === UserRole.STUDENT ? null : `${role} Identity Admin`,
      isActive: true,
      mustChangePassword: false,
    },
  });
}

async function createLinkedStudent({ complete }: { complete: boolean }) {
  const user = await createUser(UserRole.STUDENT);
  const student = await db.student.create({
    data: {
      userId: user.id,
      fullName: "Linked Identity Student",
      universityId: `IDENTITY-${randomUUID()}`,
      completedCreditHours: complete ? 30 : null,
      isTransferredThisYear: complete ? false : null,
    },
  });
  return { user, student };
}

function createUnlinkedStudent(
  overrides: {
    fullName?: string;
    completedCreditHours?: number | null;
    isTransferredThisYear?: boolean | null;
  } = {},
) {
  return db.student.create({
    data: {
      fullName: overrides.fullName ?? "Unlinked Identity Student",
      universityId: `IDENTITY-${randomUUID()}`,
      completedCreditHours: overrides.completedCreditHours,
      isTransferredThisYear: overrides.isTransferredThisYear,
    },
  });
}

function createClaim(
  studentId: string,
  userId: string,
  proposal: {
    proposedFullName?: string | null;
    proposedCompletedCreditHours?: number | null;
    proposedIsTransferredThisYear?: boolean | null;
  } = {},
) {
  return db.studentLinkClaim.create({
    data: {
      studentId,
      userId,
      proposedFullName:
        proposal.proposedFullName === undefined
          ? "Submitted Identity Student"
          : proposal.proposedFullName,
      proposedCompletedCreditHours:
        proposal.proposedCompletedCreditHours === undefined
          ? 30
          : proposal.proposedCompletedCreditHours,
      proposedIsTransferredThisYear:
        proposal.proposedIsTransferredThisYear === undefined
          ? false
          : proposal.proposedIsTransferredThisYear,
      status: StudentLinkClaimStatus.PENDING,
    },
  });
}

function createCourse() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return db.course.create({
    data: {
      code: `ID${suffix}`,
      nameAr: "مقرر الهوية",
      nameEn: "Identity Course",
      creditHours: 3,
    },
  });
}

async function waitForStudentLockWait() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await db.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND "wait_event_type" = 'Lock'
        AND query LIKE '%FROM "Student"%FOR UPDATE%'
    `;
    if (rows[0]!.waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Approval did not wait for the locked Student row");
}
