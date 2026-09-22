"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireLinkedStudent } from "@/server/authorization";
import {
  completeStudentProfile,
  StudentProfileError,
} from "@/server/student-profile";

export type CompleteProfileActionState = {
  status: "idle" | "error";
  message?: string;
};

export async function completeProfileAction(
  _previous: CompleteProfileActionState,
  formData: FormData,
): Promise<CompleteProfileActionState> {
  try {
    const user = await requireLinkedStudent();
    await completeStudentProfile(user.id, {
      completedCreditHours: formData.get("completedCreditHours"),
      isTransferredThisYear:
        formData.get("isTransferredThisYear") === "on",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: "error",
        message: error.issues[0]?.message ?? "Check the entered values.",
      };
    }
    if (error instanceof StudentProfileError) {
      return {
        status: "error",
        message: "Your Student profile is no longer available.",
      };
    }
    throw error;
  }

  redirect("/register/courses");
}
