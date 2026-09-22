import { z } from "zod";

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const textEncoder = new TextEncoder();

export const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .refine((password) => textEncoder.encode(password).byteLength <= 72, {
    message: "Password must not exceed 72 UTF-8 bytes",
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .email("Enter a valid email address");

const completedCreditHoursSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce
    .number()
    .int("Completed credit hours must be a whole number")
    .min(0, "Completed credit hours cannot be negative")
    .max(MAX_POSTGRES_INTEGER),
);

export const registerStudentSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must contain at least 2 characters")
      .max(120, "Full name is too long"),
    universityId: z
      .string()
      .trim()
      .min(1, "University ID is required")
      .max(64, "University ID is too long"),
    email: emailSchema,
    password: passwordSchema,
    completedCreditHours: completedCreditHoursSchema,
    isTransferredThisYear: z.boolean(),
  })
  .strict();

export const completeStudentProfileSchema = z
  .object({
    completedCreditHours: completedCreditHoursSchema,
    isTransferredThisYear: z.boolean(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
  })
  .strict();

export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
