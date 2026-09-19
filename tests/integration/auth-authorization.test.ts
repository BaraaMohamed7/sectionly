import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/server/auth/current-user";
import {
  AuthorizationError,
  requireAuthenticatedUser,
  requireStudent,
  requireUser,
} from "@/server/authorization";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const mockedGetServerSession = vi.mocked(getServerSession);

async function createStudent() {
  const suffix = randomUUID();

  return db.user.create({
    data: {
      fullName: "Authorization Student",
      email: `authorization-${suffix}@example.com`,
      passwordHash: await hashPassword("correct horse battery staple"),
      role: UserRole.STUDENT,
      universityId: `AUTH-${suffix}`,
      completedCreditHours: 32,
      isTransferredThisYear: false,
    },
  });
}

describe("current-user authorization", () => {
  beforeEach(() => {
    mockedGetServerSession.mockReset();
  });

  it("reloads current role and active state from PostgreSQL", async () => {
    const user = await createStudent();
    mockedGetServerSession.mockResolvedValue({
      user: { id: user.id },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(getCurrentUser()).resolves.toMatchObject({
      id: user.id,
      role: UserRole.STUDENT,
    });

    await db.user.update({
      where: { id: user.id },
      data: { role: UserRole.ADMIN },
    });
    await expect(getCurrentUser()).resolves.toMatchObject({
      role: UserRole.ADMIN,
    });

    await db.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("separates authentication, forced password change, and student access", async () => {
    const user = await createStudent();
    mockedGetServerSession.mockResolvedValue({
      user: { id: user.id },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(requireStudent()).resolves.toMatchObject({ id: user.id });

    await db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });
    await expect(requireAuthenticatedUser()).resolves.toMatchObject({ id: user.id });
    await expect(requireUser()).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_REQUIRED",
    } satisfies Partial<AuthorizationError>);

    await db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false, role: UserRole.ADMIN },
    });
    await expect(requireStudent()).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<AuthorizationError>);
  });
});
