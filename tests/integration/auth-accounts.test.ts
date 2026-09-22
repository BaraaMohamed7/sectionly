import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/client";
import {
  AccountConflictError,
  authenticateCredentials,
  changePassword,
  registerStudent,
  StudentAccountUnavailableError,
} from "@/server/auth/accounts";
import { verifyPassword } from "@/server/auth/password";
import { createPrismaClient, db } from "@/server/db";

const password = "correct horse battery staple";
const firstClient = createPrismaClient();
const secondClient = createPrismaClient();

afterAll(async () => {
  await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
});

function registrationInput() {
  const suffix = randomUUID();

  return {
    fullName: "Student Account",
    universityId: `U-${suffix}`,
    email: `student-${suffix}@example.com`,
    password,
    completedCreditHours: 31,
    isTransferredThisYear: false,
  };
}

describe("student accounts", () => {
  it("registers only a student and stores a password hash", async () => {
    const input = registrationInput();
    const account = await registerStudent(input);
    const stored = await db.user.findUniqueOrThrow({
      where: { id: account.id },
      include: { student: true },
    });

    expect(stored.email).toBe(input.email);
    expect(stored.role).toBe(UserRole.STUDENT);
    expect(stored.isActive).toBe(true);
    expect(stored.mustChangePassword).toBe(false);
    expect(stored.student).toMatchObject({
      fullName: input.fullName,
      universityId: input.universityId,
      completedCreditHours: input.completedCreditHours,
      isTransferredThisYear: input.isTransferredThisYear,
    });
    expect(stored.student?.id).not.toBe(stored.id);
    expect(stored.passwordHash).not.toBe(input.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(verifyPassword(input.password, stored.passwordHash)).resolves.toBe(
      true,
    );
  });

  it("normalizes email and rejects a duplicate email", async () => {
    const input = registrationInput();
    const first = await registerStudent({
      ...input,
      email: `  ${input.email.toUpperCase()}  `,
    });

    expect(first.email).toBe(input.email);

    await expect(
      registerStudent({
        ...registrationInput(),
        email: input.email.toUpperCase(),
      }),
    ).rejects.toMatchObject({ field: "email" } satisfies Partial<AccountConflictError>);

  });

  it("creates a pending claim for an existing unlinked Student", async () => {
    const input = registrationInput();
    const student = await db.student.create({
      data: {
        fullName: "Authoritative Student Name",
        universityId: input.universityId,
      },
    });

    const result = await registerStudent(input);

    expect(result).toMatchObject({ state: "PENDING_CLAIM" });
    if (result.state !== "PENDING_CLAIM") {
      throw new Error("Expected a pending Student link claim");
    }
    await expect(
      db.user.findUniqueOrThrow({
        where: { id: result.id },
        select: { student: true },
      }),
    ).resolves.toMatchObject({ student: null });
    await expect(
      db.studentLinkClaim.findUniqueOrThrow({
        where: { id: result.claimId },
      }),
    ).resolves.toMatchObject({
      studentId: student.id,
      userId: result.id,
      status: "PENDING",
      proposedFullName: input.fullName,
      proposedCompletedCreditHours: input.completedCreditHours,
      proposedIsTransferredThisYear: input.isTransferredThisYear,
    });
    await expect(
      db.student.findUniqueOrThrow({ where: { id: student.id } }),
    ).resolves.toMatchObject({
      fullName: "Authoritative Student Name",
      completedCreditHours: null,
      isTransferredThisYear: null,
      userId: null,
    });
    await expect(
      authenticateCredentials({ email: input.email, password: input.password }),
    ).resolves.toMatchObject({ name: input.email });
  });

  it("does not reveal whether an existing Student is already linked", async () => {
    const linked = await registerStudent(registrationInput());

    await expect(
      registerStudent({
        ...registrationInput(),
        universityId: (
          await db.student.findUniqueOrThrow({ where: { userId: linked.id } })
        ).universityId,
      }),
    ).rejects.toBeInstanceOf(StudentAccountUnavailableError);
  });

  it("returns the same unavailable result when identical registrations race", async () => {
    const input = registrationInput();

    const results = await Promise.allSettled([
      registerStudent(input, firstClient),
      registerStudent(input, secondClient),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(StudentAccountUnavailableError),
    });
  });

  it("prevents public role escalation", async () => {
    const input = { ...registrationInput(), role: UserRole.SUPER_ADMIN };

    await expect(registerStudent(input)).rejects.toThrow();
    await expect(db.user.findUnique({ where: { email: input.email } })).resolves.toBeNull();
  });

  it("authenticates valid credentials with canonical email", async () => {
    const input = registrationInput();
    const registered = await registerStudent(input);

    await expect(
      authenticateCredentials({
        email: ` ${input.email.toUpperCase()} `,
        password: input.password,
      }),
    ).resolves.toEqual({
      id: registered.id,
      email: input.email,
      name: input.fullName,
    });
  });

  it("rejects invalid passwords, unknown users, and inactive users", async () => {
    const input = registrationInput();
    const registered = await registerStudent(input);

    await expect(
      authenticateCredentials({ email: input.email, password: "wrong password" }),
    ).resolves.toBeNull();
    await expect(
      authenticateCredentials({
        email: `missing-${randomUUID()}@example.com`,
        password,
      }),
    ).resolves.toBeNull();

    await db.user.update({
      where: { id: registered.id },
      data: { isActive: false },
    });

    await expect(
      authenticateCredentials({ email: input.email, password: input.password }),
    ).resolves.toBeNull();
  });

  it("changes a password and clears the forced-change flag", async () => {
    const input = registrationInput();
    const registered = await registerStudent(input);
    await db.user.update({
      where: { id: registered.id },
      data: { mustChangePassword: true },
    });

    const newPassword = "a different secure password";
    await changePassword(registered.id, {
      currentPassword: input.password,
      newPassword,
    });

    const stored = await db.user.findUniqueOrThrow({
      where: { id: registered.id },
    });
    expect(stored.mustChangePassword).toBe(false);
    await expect(verifyPassword(newPassword, stored.passwordHash)).resolves.toBe(true);
    await expect(verifyPassword(input.password, stored.passwordHash)).resolves.toBe(false);
  });
});
