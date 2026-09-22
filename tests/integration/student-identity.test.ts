import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  StudentLinkClaimStatus,
  UserRole,
} from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/server/audit-actions";
import { createPrismaClient, db } from "@/server/db";
import { completeStudentProfile, StudentProfileError } from "@/server/student-profile";
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

  it("allows only a Super Admin to approve a claim", async () => {
    const actor = await createUser(UserRole.ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent();
    const claim = await createClaim(student.id, requester.id);

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
    ).resolves.toMatchObject({ userId: null });
  });

  it("revalidates approval eligibility but still permits rejection", async () => {
    const actor = await createUser(UserRole.SUPER_ADMIN);
    const requester = await createUser(UserRole.STUDENT);
    const student = await createUnlinkedStudent();
    const claim = await createClaim(student.id, requester.id);
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
    ).resolves.toMatchObject({ userId: null });
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

function createUnlinkedStudent() {
  return db.student.create({
    data: {
      fullName: "Unlinked Identity Student",
      universityId: `IDENTITY-${randomUUID()}`,
    },
  });
}

function createClaim(studentId: string, userId: string) {
  return db.studentLinkClaim.create({
    data: { studentId, userId, status: StudentLinkClaimStatus.PENDING },
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
