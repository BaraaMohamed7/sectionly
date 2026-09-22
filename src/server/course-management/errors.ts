export type CourseManagementErrorCode =
  | "FORBIDDEN"
  | "UNAUTHORIZED_COURSE"
  | "COURSE_NOT_FOUND"
  | "SECTION_NOT_FOUND"
  | "SECTION_NUMBER_EXISTS"
  | "RESPONSIBLE_ADMIN_NOT_ASSIGNED"
  | "CAPACITY_DECREASE_NOT_ALLOWED"
  | "CONFLICT_CONFIRMATION_REQUIRED"
  | "INVALID_TRANSFER_TARGET"
  | "TRANSFER_STUDENT_NOT_IN_SOURCE"
  | "TARGET_SECTION_FULL"
  | "DELETION_CONFIRMATION_REQUIRED"
  | "STALE_SECTION_EDIT"
  | "WINDOW_ALREADY_PAUSED"
  | "WINDOW_NOT_PAUSED"
  | "WINDOW_NOT_CONFIGURED"
  | "PAUSED_WINDOW_CANNOT_BE_CLEARED";

export class CourseManagementError extends Error {
  constructor(
    readonly code: CourseManagementErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "CourseManagementError";
  }
}
