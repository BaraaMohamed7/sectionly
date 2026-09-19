"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  changePassword,
  InvalidCurrentPasswordError,
} from "@/server/auth/accounts";
import { changePasswordSchema } from "@/server/auth/validation";
import {
  AuthorizationError,
  requireAuthenticatedUser,
} from "@/server/authorization";

export type ChangePasswordActionState = {
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function changePasswordAction(
  _state: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  let user;

  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login");
    }

    throw error;
  }

  const result = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });

  if (!result.success) {
    return { fieldErrors: z.flattenError(result.error).fieldErrors };
  }

  try {
    await changePassword(user.id, result.data);
  } catch (error) {
    if (error instanceof InvalidCurrentPasswordError) {
      return { fieldErrors: { currentPassword: ["Current password is incorrect"] } };
    }

    return { message: "We couldn't change your password. Please try again." };
  }

  redirect("/auth/continue");
}
