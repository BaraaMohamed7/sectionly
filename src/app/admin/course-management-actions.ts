"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUser } from "@/server/authorization";
import type { ConflictPreview } from "@/server/course-management/conflicts";
import {
  CourseManagementError,
  type CourseManagementErrorCode,
} from "@/server/course-management/errors";
import {
  confirmCreateSection,
  confirmDeleteSection,
  confirmUpdateSection,
  createSection,
  previewSectionDeletion,
  setSectionPublication,
  updateSection,
} from "@/server/course-management/sections";
import {
  pauseCourseWindow,
  resumeCourseWindow,
  updateCourseWindow,
} from "@/server/course-management/windows";

export type CourseManagementActionState = {
  status: "idle" | "success" | "warning" | "error";
  message?: string;
  warnings?: ConflictPreview;
  deletionPlan?: {
    transferCount: number;
    removalCount: number;
    targetCounts: Array<{ targetSectionId: string; transferCount: number }>;
    studentConflicts: ConflictPreview["studentConflicts"];
  };
};

export const INITIAL_COURSE_MANAGEMENT_STATE: CourseManagementActionState = {
  status: "idle",
};

export async function saveSectionAction(
  _previous: CourseManagementActionState,
  formData: FormData,
): Promise<CourseManagementActionState> {
  const courseId = formValue(formData, "courseId");
  try {
    const actor = await requireUser();
    const sectionId = formValue(formData, "sectionId");
    const confirmed = formData.get("confirmConflicts") === "true";
    const input = {
      sectionNumber: formData.get("sectionNumber"),
      responsibleAdminId: formData.get("responsibleAdminId"),
      day: formData.get("day"),
      startMinute: timeToMinute(formData.get("startTime")),
      endMinute: timeToMinute(formData.get("endTime")),
      location: formData.get("location"),
      capacity: formData.get("capacity"),
    };
    const result = sectionId
      ? confirmed
        ? await confirmUpdateSection(
            actor.id,
            courseId,
            sectionId,
            input,
            formData.get("expectedUpdatedAt"),
          )
        : await updateSection(
            actor.id,
            courseId,
            sectionId,
            input,
            formData.get("expectedUpdatedAt"),
          )
      : confirmed
        ? await confirmCreateSection(actor.id, courseId, input)
        : await createSection(actor.id, courseId, input);

    revalidateCourse(courseId);
    return {
      status: "success",
      message: sectionId ? "Section updated." : "Section created as unpublished.",
      warnings: result.warnings,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function setSectionPublicationAction(
  _previous: CourseManagementActionState,
  formData: FormData,
): Promise<CourseManagementActionState> {
  const courseId = formValue(formData, "courseId");
  try {
    const actor = await requireUser();
    const publish = formData.get("publish") === "true";
    await setSectionPublication(
      actor.id,
      courseId,
      formValue(formData, "sectionId"),
      publish,
    );
    revalidateCourse(courseId);
    return {
      status: "success",
      message: publish
        ? "Section published for enrolled students."
        : "Section unpublished. Existing registrations were preserved.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteSectionAction(
  _previous: CourseManagementActionState,
  formData: FormData,
): Promise<CourseManagementActionState> {
  const courseId = formValue(formData, "courseId");
  try {
    const actor = await requireUser();
    const sectionId = formValue(formData, "sectionId");
    const transfers = formData
      .getAll("studentId")
      .filter((studentId): studentId is string => typeof studentId === "string")
      .flatMap((studentId) => {
        const target = formData.get(`transfer-${studentId}`);
        return typeof target === "string" && target !== ""
          ? [{ studentId, targetSectionId: target }]
          : [];
      });
    const intent = formData.get("intent");

    if (intent !== "confirm-delete") {
      const deletionPlan = await previewSectionDeletion(
        actor.id,
        courseId,
        sectionId,
        transfers,
      );
      return {
        status: "warning",
        message:
          "Review the transfer totals and schedule warnings before permanently deleting this section.",
        deletionPlan,
      };
    }

    const result = await confirmDeleteSection(
      actor.id,
      courseId,
      sectionId,
      transfers,
    );
    revalidateCourse(courseId);
    return {
      status: "success",
      message: `Section deleted. ${result.transferredCount} transferred; ${result.removedCount} registrations removed. Course selections were preserved.`,
      warnings: result.warnings,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function manageCourseWindowAction(
  _previous: CourseManagementActionState,
  formData: FormData,
): Promise<CourseManagementActionState> {
  const courseId = formValue(formData, "courseId");
  try {
    const actor = await requireUser();
    const type = formData.get("windowType");
    const intent = formData.get("intent");

    if (intent === "update") {
      await updateCourseWindow(actor.id, courseId, type, {
        opensAt: formData.get("opensAt"),
        closesAt: formData.get("closesAt"),
      });
    } else if (intent === "pause") {
      await pauseCourseWindow(actor.id, courseId, type);
    } else if (intent === "resume" || intent === "resume-extend") {
      await resumeCourseWindow(
        actor.id,
        courseId,
        type,
        intent === "resume-extend" ? "extend" : "normal",
      );
    } else {
      throw new Error("Unknown window action");
    }

    revalidateCourse(courseId);
    return { status: "success", message: "Course window updated." };
  } catch (error) {
    return actionError(error);
  }
}

function revalidateCourse(courseId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
}

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function timeToMinute(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function actionError(error: unknown): CourseManagementActionState {
  if (error instanceof ZodError) {
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the entered values.",
    };
  }
  if (error instanceof CourseManagementError) {
    if (error.code === "CONFLICT_CONFIRMATION_REQUIRED") {
      return {
        status: "warning",
        message:
          "This schedule has operational conflicts. Review them before overriding.",
        warnings: error.details as ConflictPreview,
      };
    }
    return { status: "error", message: managementErrorMessage(error.code) };
  }

  console.error(error);
  return { status: "error", message: "The operation could not be completed." };
}

function managementErrorMessage(code: CourseManagementErrorCode) {
  const messages: Record<CourseManagementErrorCode, string> = {
    FORBIDDEN: "Your account can no longer perform this operation.",
    COURSE_NOT_FOUND: "The course was not found.",
    UNAUTHORIZED_COURSE: "You are not assigned to manage this course.",
    RESPONSIBLE_ADMIN_NOT_ASSIGNED:
      "The responsible Admin must be assigned to this course.",
    SECTION_NOT_FOUND: "The section was not found.",
    SECTION_NUMBER_EXISTS: "That section number is already used in this course.",
    CAPACITY_DECREASE_NOT_ALLOWED:
      "Section capacity cannot be decreased after creation.",
    CONFLICT_CONFIRMATION_REQUIRED: "Review the conflicts before continuing.",
    STALE_SECTION_EDIT:
      "This section changed since you opened it. Refresh and try again.",
    INVALID_TRANSFER_TARGET: "Every transfer target must be another section in this course.",
    TRANSFER_STUDENT_NOT_IN_SOURCE:
      "The transfer list contains a student who is no longer in this section.",
    TARGET_SECTION_FULL:
      "A target section no longer has enough seats. No changes were made.",
    WINDOW_NOT_CONFIGURED: "Set both window dates before pausing or resuming.",
    WINDOW_ALREADY_PAUSED: "This window is already paused.",
    WINDOW_NOT_PAUSED: "This window is not currently paused.",
    PAUSED_WINDOW_CANNOT_BE_CLEARED:
      "Resume this window before clearing its dates.",
  };
  return messages[code];
}
