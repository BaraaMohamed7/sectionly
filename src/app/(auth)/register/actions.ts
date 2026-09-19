"use server";

import { z } from "zod";
import {
  AccountConflictError,
  registerStudent,
} from "@/server/auth/accounts";
import { registerStudentSchema } from "@/server/auth/validation";

export type RegistrationActionResult =
  | { ok: true; email: string }
  | {
      ok: false;
      message?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

export async function registerStudentAction(
  formData: FormData,
): Promise<RegistrationActionResult> {
  const result = registerStudentSchema.safeParse({
    fullName: formData.get("fullName"),
    universityId: formData.get("universityId"),
    email: formData.get("email"),
    password: formData.get("password"),
    completedCreditHours: formData.get("completedCreditHours"),
    isTransferredThisYear:
      formData.get("isTransferredThisYear") === "on",
  });

  if (!result.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(result.error).fieldErrors,
    };
  }

  try {
    const user = await registerStudent(result.data);
    return { ok: true, email: user.email };
  } catch (error) {
    if (error instanceof AccountConflictError) {
      return {
        ok: false,
        fieldErrors: {
          [error.field]: [
            error.field === "email"
              ? "An account with this email already exists"
              : "An account with this university ID already exists",
          ],
        },
      };
    }

    return {
      ok: false,
      message: "We couldn't create your account. Please try again.",
    };
  }
}
