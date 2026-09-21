"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AuthorizationError, requireStudent } from "@/server/authorization";
import { StudentCourseError } from "@/server/student-courses/errors";
import {
  addStudentCourse,
  completeStudentOnboarding,
  removeStudentCourse,
} from "@/server/student-courses/service";

export type StudentCourseActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function completeOnboardingAction(
  _previousState: StudentCourseActionState,
  formData: FormData,
): Promise<StudentCourseActionState> {
  try {
    const student = await requireStudent();
    await completeStudentOnboarding(student.id, formData.getAll("courseId"));
  } catch (error) {
    return actionError(error);
  }

  redirect("/dashboard");
}

export async function addCourseAction(
  _previousState: StudentCourseActionState,
  formData: FormData,
): Promise<StudentCourseActionState> {
  try {
    const student = await requireStudent();
    await addStudentCourse(student.id, String(formData.get("courseId") ?? ""));
    revalidateStudentCoursePaths();
    return { status: "success", message: "Course added." };
  } catch (error) {
    return actionError(error);
  }
}

export async function removeCourseAction(
  _previousState: StudentCourseActionState,
  formData: FormData,
): Promise<StudentCourseActionState> {
  try {
    const student = await requireStudent();
    await removeStudentCourse(
      student.id,
      String(formData.get("courseId") ?? ""),
    );
    revalidateStudentCoursePaths();
    return { status: "success", message: "Course removed." };
  } catch (error) {
    return actionError(error);
  }
}

function revalidateStudentCoursePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/courses");
}

function actionError(error: unknown): StudentCourseActionState {
  if (error instanceof StudentCourseError) {
    return { status: "error", message: errorMessage(error.code) };
  }
  if (error instanceof AuthorizationError) {
    return {
      status: "error",
      message: "Your student access changed. Sign in again and retry.",
    };
  }
  if (error instanceof ZodError) {
    return { status: "error", message: "Select a valid course and retry." };
  }

  console.error(error);
  return { status: "error", message: "We couldn't update your courses." };
}

function errorMessage(code: StudentCourseError["code"]) {
  const messages: Record<StudentCourseError["code"], string> = {
    FORBIDDEN: "Your student access changed. Sign in again and retry.",
    ONBOARDING_ALREADY_COMPLETED:
      "Course onboarding is already complete. Manage your courses instead.",
    ONBOARDING_NOT_COMPLETED:
      "Complete your initial course selection before managing courses.",
    COURSE_NOT_FOUND: "That course is no longer available.",
    ALREADY_ENROLLED: "You already selected this course.",
    NOT_ENROLLED: "This course is not in your selected courses.",
    CREDIT_HOUR_LIMIT_EXCEEDED:
      "This selection would exceed the 19 credit-hour limit.",
    COURSE_REMOVAL_BLOCKED:
      "This course could not be removed because it has a section registration.",
  };

  return messages[code];
}
