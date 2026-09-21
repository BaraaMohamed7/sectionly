"use server";

import { UserRole } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AuthorizationError, requireSuperAdmin } from "@/server/authorization";
import {
  createAdminAccount,
  reissueAdminTemporaryPassword,
  setAdminActive,
  setAdminRole,
} from "@/server/super-admin/admin-accounts";
import {
  assignCourseAdmin,
  createCourse,
  setPrimaryCourseAdmin,
  unassignCourseAdmin,
  updateCourse,
} from "@/server/super-admin/courses";
import { SuperAdminError } from "@/server/super-admin/errors";

export type AdminActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  temporaryPassword?: string;
};

export async function createAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireSuperAdmin();
    const result = await createAdminAccount(actor.id, {
      fullName: formData.get("fullName"),
      email: formData.get("email"),
    });
    revalidatePath("/admin/admins");
    return {
      status: "success",
      message: "Admin account created. Share this password securely now.",
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function manageAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireSuperAdmin();
    const adminId = String(formData.get("adminId") ?? "");
    const intent = formData.get("intent");

    if (intent === "activate") {
      await setAdminActive(actor.id, adminId, true);
    } else if (intent === "deactivate") {
      await setAdminActive(actor.id, adminId, false);
    } else if (intent === "promote") {
      await setAdminRole(actor.id, adminId, UserRole.SUPER_ADMIN);
    } else if (intent === "demote") {
      await setAdminRole(actor.id, adminId, UserRole.ADMIN);
    } else if (intent === "reissue-password") {
      const result = await reissueAdminTemporaryPassword(actor.id, adminId);
      revalidateAdminPaths(adminId);
      return {
        status: "success",
        message:
          "Temporary password reissued. The previous password no longer works.",
        temporaryPassword: result.temporaryPassword,
      };
    } else {
      throw new Error("Unknown Admin action");
    }

    revalidateAdminPaths(adminId);
    return { status: "success", message: "Admin account updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveCourseAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireSuperAdmin();
    const courseId = formData.get("courseId");
    const input = {
      code: formData.get("code"),
      nameAr: formData.get("nameAr"),
      nameEn: formData.get("nameEn"),
      creditHours: formData.get("creditHours"),
      registrationOpensAt: formData.get("registrationOpensAt"),
      registrationClosesAt: formData.get("registrationClosesAt"),
      switchingOpensAt: formData.get("switchingOpensAt"),
      switchingClosesAt: formData.get("switchingClosesAt"),
      registrationPaused: formData.get("registrationPaused") === "on",
      switchingPaused: formData.get("switchingPaused") === "on",
    };

    if (typeof courseId === "string" && courseId !== "") {
      await updateCourse(actor.id, courseId, input);
      revalidatePath(`/admin/courses/${courseId}`);
    } else {
      await createCourse(actor.id, input);
    }
    revalidatePath("/admin/courses");
    return {
      status: "success",
      message: courseId ? "Course updated." : "Course created.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function manageCourseAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const courseId = String(formData.get("courseId") ?? "");

  try {
    const actor = await requireSuperAdmin();
    const adminValue = formData.get("adminId");
    const adminId = typeof adminValue === "string" ? adminValue : "";
    const intent = formData.get("intent");

    if (intent === "assign") {
      await assignCourseAdmin(actor.id, courseId, adminId);
    } else if (intent === "unassign") {
      await unassignCourseAdmin(actor.id, courseId, adminId);
    } else if (intent === "make-primary") {
      await setPrimaryCourseAdmin(actor.id, courseId, adminId);
    } else if (intent === "clear-primary") {
      await setPrimaryCourseAdmin(actor.id, courseId, null);
    } else {
      throw new Error("Unknown course Admin action");
    }

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    return { status: "success", message: "Course assignments updated." };
  } catch (error) {
    return actionError(error);
  }
}

function revalidateAdminPaths(adminId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/admins");
  revalidatePath(`/admin/admins/${adminId}`);
  revalidatePath("/admin/courses");
}

function actionError(error: unknown): AdminActionState {
  if (error instanceof ZodError) {
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Invalid input.",
    };
  }

  if (error instanceof SuperAdminError) {
    return { status: "error", message: errorMessage(error.code) };
  }

  if (error instanceof AuthorizationError) {
    return {
      status: "error",
      message: "Your session no longer has access to this operation.",
    };
  }

  console.error(error);
  return { status: "error", message: "The operation could not be completed." };
}

function errorMessage(code: SuperAdminError["code"]) {
  const messages: Record<SuperAdminError["code"], string> = {
    FORBIDDEN: "Your Super Admin access is no longer active.",
    ACTIVE_SUPER_ADMIN_EXISTS: "An active Super Admin already exists.",
    ADMIN_NOT_FOUND: "The Admin account was not found.",
    EMAIL_EXISTS: "An account already uses this email address.",
    INVALID_ADMIN_TRANSITION: "That account is already in the requested state.",
    LAST_ACTIVE_SUPER_ADMIN: "At least one active Super Admin must remain.",
    COURSE_NOT_FOUND: "The course was not found.",
    COURSE_CODE_EXISTS: "A course already uses this code.",
    INVALID_ASSIGNEE_ROLE: "Only Admins and Super Admins can be assigned.",
    ASSIGNMENT_EXISTS: "This Admin is already assigned to the course.",
    ASSIGNMENT_NOT_FOUND: "The course assignment was not found.",
  };

  return messages[code];
}
