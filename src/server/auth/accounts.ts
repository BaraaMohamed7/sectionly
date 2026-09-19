import { Prisma, UserRole } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "@/server/auth/password";
import {
  changePasswordSchema,
  loginSchema,
  registerStudentSchema,
} from "@/server/auth/validation";

export type AccountConflictField = "email" | "universityId";

export class AccountConflictError extends Error {
  constructor(readonly field: AccountConflictField) {
    super(`An account with this ${field} already exists`);
    this.name = "AccountConflictError";
  }
}

export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super("Current password is invalid");
    this.name = "InvalidCurrentPasswordError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function registerStudent(input: unknown) {
  const data = registerStudentSchema.parse(input);
  const passwordHash = await hashPassword(data.password);

  try {
    const user = await db.user.create({
      data: {
        fullName: data.fullName,
        universityId: data.universityId,
        email: data.email,
        passwordHash,
        completedCreditHours: data.completedCreditHours,
        isTransferredThisYear: data.isTransferredThisYear,
        role: UserRole.STUDENT,
        isActive: true,
        mustChangePassword: false,
        onboardingCompletedAt: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });

    return user;
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existing = await db.user.findFirst({
      where: {
        OR: [{ email: data.email }, { universityId: data.universityId }],
      },
      select: { email: true, universityId: true },
    });

    if (existing?.email === data.email) {
      throw new AccountConflictError("email");
    }

    throw new AccountConflictError("universityId");
  }
}

export async function authenticateCredentials(input: unknown) {
  const result = loginSchema.safeParse(input);

  if (!result.success) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { email: result.data.email },
    select: {
      id: true,
      email: true,
      fullName: true,
      passwordHash: true,
      isActive: true,
    },
  });
  const passwordMatches = await verifyPassword(
    result.data.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !user.isActive || !passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
  };
}

export async function changePassword(userId: string, input: unknown) {
  const data = changePasswordSchema.parse(input);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, isActive: true },
  });
  const currentPasswordMatches = await verifyPassword(
    data.currentPassword,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user?.isActive || !currentPasswordMatches) {
    throw new InvalidCurrentPasswordError();
  }

  const passwordHash = await hashPassword(data.newPassword);
  const update = await db.user.updateMany({
    where: { id: userId, isActive: true },
    data: { passwordHash, mustChangePassword: false },
  });

  if (update.count !== 1) {
    throw new InvalidCurrentPasswordError();
  }
}
