import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser, type CurrentUser } from "@/server/auth/current-user";

export type AuthorizationErrorCode =
  | "UNAUTHENTICATED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "FORBIDDEN"
  | "STUDENT_LINK_REQUIRED"
  | "STUDENT_PROFILE_INCOMPLETE";

export class AuthorizationError extends Error {
  constructor(readonly code: AuthorizationErrorCode) {
    super(code);
    this.name = "AuthorizationError";
  }
}

export type CurrentStudent = CurrentUser & {
  role: typeof UserRole.STUDENT;
  student: NonNullable<CurrentUser["student"]> & {
    completedCreditHours: number;
    isTransferredThisYear: boolean;
  };
};

export type CurrentLinkedStudent = CurrentUser & {
  role: typeof UserRole.STUDENT;
  student: NonNullable<CurrentUser["student"]>;
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
  const user = await requireLinkedStudent();

  if (
    user.student.completedCreditHours === null ||
    user.student.isTransferredThisYear === null
  ) {
    throw new AuthorizationError("STUDENT_PROFILE_INCOMPLETE");
  }

  return user as CurrentStudent;
}

export async function requireLinkedStudent(): Promise<CurrentLinkedStudent> {
  const user = await requireUser();

  if (user.role !== UserRole.STUDENT) {
    throw new AuthorizationError("FORBIDDEN");
  }

  if (!user.student) {
    throw new AuthorizationError("STUDENT_LINK_REQUIRED");
  }

  return user as CurrentLinkedStudent;
}

export async function requireSuperAdmin(): Promise<CurrentSuperAdmin> {
  const user = await requireUser();

  if (user.role !== UserRole.SUPER_ADMIN) {
    throw new AuthorizationError("FORBIDDEN");
  }

  return user as CurrentSuperAdmin;
}
