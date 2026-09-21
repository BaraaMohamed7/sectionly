export type SuperAdminErrorCode =
  | "FORBIDDEN"
  | "ACTIVE_SUPER_ADMIN_EXISTS"
  | "ADMIN_NOT_FOUND"
  | "EMAIL_EXISTS"
  | "INVALID_ADMIN_TRANSITION"
  | "LAST_ACTIVE_SUPER_ADMIN"
  | "COURSE_NOT_FOUND"
  | "COURSE_CODE_EXISTS"
  | "INVALID_ASSIGNEE_ROLE"
  | "ASSIGNMENT_EXISTS"
  | "ASSIGNMENT_NOT_FOUND";

export class SuperAdminError extends Error {
  constructor(readonly code: SuperAdminErrorCode) {
    super(code);
    this.name = "SuperAdminError";
  }
}
