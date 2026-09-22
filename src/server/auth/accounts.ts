import {
  Prisma,
  StudentLinkClaimStatus,
  UserRole,
} from "@/generated/prisma/client";
import { db, type DatabaseClient } from "@/server/db";
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

export type AccountConflictField = "email";

export class AccountConflictError extends Error {
  constructor(readonly field: AccountConflictField) {
    super(`An account with this ${field} already exists`);
    this.name = "AccountConflictError";
  }
}

export class StudentAccountUnavailableError extends Error {
  constructor() {
    super("Student account registration is unavailable for these details");
    this.name = "StudentAccountUnavailableError";
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

export async function registerStudent(
  input: unknown,
  database: DatabaseClient = db,
) {
  const data = registerStudentSchema.parse(input);
  const passwordHash = await hashPassword(data.password);

  try {
    return await database.$transaction(async (transaction) => {
      const existingStudents = await transaction.$queryRaw<
        Array<{ id: string; userId: string | null }>
      >`
        SELECT id, "userId"
        FROM "Student"
        WHERE "universityId" = ${data.universityId}
        FOR UPDATE
      `;
      const existingStudent = existingStudents[0];

      if (existingStudent?.userId) {
        throw new StudentAccountUnavailableError();
      }

      const user = await transaction.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: UserRole.STUDENT,
          adminName: null,
          isActive: true,
          mustChangePassword: false,
        },
        select: { id: true, email: true },
      });

      if (!existingStudent) {
        const student = await transaction.student.create({
          data: {
            universityId: data.universityId,
            fullName: data.fullName,
            completedCreditHours: data.completedCreditHours,
            isTransferredThisYear: data.isTransferredThisYear,
            userId: user.id,
          },
          select: { id: true },
        });
        return {
          ...user,
          name: data.fullName,
          state: "LINKED" as const,
          studentId: student.id,
        };
      }

      const claim = await transaction.studentLinkClaim.create({
        data: {
          studentId: existingStudent.id,
          userId: user.id,
          proposedFullName: data.fullName,
          proposedCompletedCreditHours: data.completedCreditHours,
          proposedIsTransferredThisYear: data.isTransferredThisYear,
          status: StudentLinkClaimStatus.PENDING,
        },
        select: { id: true },
      });
      return {
        ...user,
        name: data.fullName,
        state: "PENDING_CLAIM" as const,
        claimId: claim.id,
      };
    });
  } catch (error) {
    if (error instanceof StudentAccountUnavailableError) throw error;
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const [existingUser, existingStudent] = await Promise.all([
      database.user.findUnique({
        where: { email: data.email },
        select: { email: true },
      }),
      database.student.findUnique({
        where: { universityId: data.universityId },
        select: { id: true, userId: true },
      }),
    ]);

    if (existingStudent?.userId) {
      throw new StudentAccountUnavailableError();
    }
    if (existingUser) {
      throw new AccountConflictError("email");
    }
    if (existingStudent) throw new StudentAccountUnavailableError();
    throw error;
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
      adminName: true,
      student: { select: { fullName: true } },
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
    name:
      user.student?.fullName ??
      (user.adminName ? `Dr. ${user.adminName}` : user.email),
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
