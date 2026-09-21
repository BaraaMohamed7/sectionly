import { UserRole } from "@/generated/prisma/client";
import { z } from "zod";
import { emailSchema } from "@/server/auth/validation";
import { parseCairoDateTime } from "@/server/timezone";

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const nullableLocalDateTimeSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().regex(LOCAL_DATE_TIME_PATTERN).nullable(),
);

export const createAdminSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema,
  })
  .strict();

export const managedAdminRoleSchema = z.enum([
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
]);

export const courseInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(1).max(64),
    nameAr: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().min(1).max(200),
    creditHours: z.coerce.number().int().min(1).max(MAX_POSTGRES_INTEGER),
    registrationOpensAt: nullableLocalDateTimeSchema,
    registrationClosesAt: nullableLocalDateTimeSchema,
    switchingOpensAt: nullableLocalDateTimeSchema,
    switchingClosesAt: nullableLocalDateTimeSchema,
    registrationPaused: z.boolean(),
    switchingPaused: z.boolean(),
  })
  .strict()
  .superRefine((data, context) => {
    validateWindowPair(
      data.registrationOpensAt,
      data.registrationClosesAt,
      "registrationClosesAt",
      context,
    );
    validateWindowPair(
      data.switchingOpensAt,
      data.switchingClosesAt,
      "switchingClosesAt",
      context,
    );
  });

function validateWindowPair(
  opensAt: string | null,
  closesAt: string | null,
  path: "registrationClosesAt" | "switchingClosesAt",
  context: z.RefinementCtx,
) {
  if ((opensAt === null) !== (closesAt === null)) {
    context.addIssue({
      code: "custom",
      message: "Opening and closing times must both be set or both be empty",
      path: [path],
    });
    return;
  }

  if (opensAt === null || closesAt === null) {
    return;
  }

  try {
    if (parseCairoDateTime(opensAt) >= parseCairoDateTime(closesAt)) {
      context.addIssue({
        code: "custom",
        message: "Closing time must be after opening time",
        path: [path],
      });
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "Enter a valid Africa/Cairo date and time",
      path: [path],
    });
  }
}

export function parseCourseInput(input: unknown) {
  const data = courseInputSchema.parse(input);

  return {
    ...data,
    registrationOpensAt: data.registrationOpensAt
      ? parseCairoDateTime(data.registrationOpensAt)
      : null,
    registrationClosesAt: data.registrationClosesAt
      ? parseCairoDateTime(data.registrationClosesAt)
      : null,
    switchingOpensAt: data.switchingOpensAt
      ? parseCairoDateTime(data.switchingOpensAt)
      : null,
    switchingClosesAt: data.switchingClosesAt
      ? parseCairoDateTime(data.switchingClosesAt)
      : null,
  };
}

export const idSchema = z.string().uuid();
