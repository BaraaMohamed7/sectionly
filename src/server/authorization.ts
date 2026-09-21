import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser, type CurrentUser } from "@/server/auth/current-user";

export type AuthorizationErrorCode =
  | "UNAUTHENTICATED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "FORBIDDEN"
  | "INVALID_STUDENT_STATE";

export class AuthorizationError extends Error {
  constructor(readonly code: AuthorizationErrorCode) {
    super(code);
    this.name = "AuthorizationError";
  }
}

export type CurrentStudent = CurrentUser & {
  role: typeof UserRole.STUDENT;
  universityId: string;
  completedCreditHours: number;
  isTransferredThisYear: boolean;
};

export type CurrentSuperAdmin = CurrentUser & {
  role: typeof UserRole.SUPER_ADMIN;
};

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthorizationError("UNAUTHENTICATED");
  }

  return user;
}

export async function requireUser() {
  const user = await requireAuthenticatedUser();

  if (user.mustChangePassword) {
    throw new AuthorizationError("PASSWORD_CHANGE_REQUIRED");
  }

  return user;
}

export async function requireStudent(): Promise<CurrentStudent> {
  const user = await requireUser();

  if (user.role !== UserRole.STUDENT) {
    throw new AuthorizationError("FORBIDDEN");
  }

  if (
    user.universityId === null ||
    user.completedCreditHours === null ||
    user.isTransferredThisYear === null
  ) {
    throw new AuthorizationError("INVALID_STUDENT_STATE");
  }

  return user as CurrentStudent;
}

export async function requireSuperAdmin(): Promise<CurrentSuperAdmin> {
  const user = await requireUser();

  if (user.role !== UserRole.SUPER_ADMIN) {
    throw new AuthorizationError("FORBIDDEN");
  }

  return user as CurrentSuperAdmin;
}
