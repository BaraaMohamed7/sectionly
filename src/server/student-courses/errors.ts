export type StudentCourseErrorCode =
  | "FORBIDDEN"
  | "ONBOARDING_ALREADY_COMPLETED"
  | "ONBOARDING_NOT_COMPLETED"
  | "COURSE_NOT_FOUND"
  | "ALREADY_ENROLLED"
  | "NOT_ENROLLED"
  | "CREDIT_HOUR_LIMIT_EXCEEDED"
  | "COURSE_REMOVAL_BLOCKED";

export class StudentCourseError extends Error {
  constructor(readonly code: StudentCourseErrorCode) {
    super(code);
    this.name = "StudentCourseError";
  }
}
