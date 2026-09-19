import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/client";
import {
  AccountConflictError,
  authenticateCredentials,
  changePassword,
  registerStudent,
} from "@/server/auth/accounts";
import { verifyPassword } from "@/server/auth/password";
import { db } from "@/server/db";

const password = "correct horse battery staple";

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
    });

    expect(stored.email).toBe(input.email);
    expect(stored.role).toBe(UserRole.STUDENT);
    expect(stored.isActive).toBe(true);
    expect(stored.mustChangePassword).toBe(false);
    expect(stored.onboardingCompletedAt).toBeNull();
    expect(stored.passwordHash).not.toBe(input.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(verifyPassword(input.password, stored.passwordHash)).resolves.toBe(
      true,
    );
  });

  it("normalizes email and rejects duplicate email or university ID", async () => {
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

    await expect(
      registerStudent({
        ...registrationInput(),
        universityId: input.universityId,
      }),
    ).rejects.toMatchObject({
      field: "universityId",
    } satisfies Partial<AccountConflictError>);
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
