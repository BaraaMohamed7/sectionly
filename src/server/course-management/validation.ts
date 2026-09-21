import { DayOfWeek } from "@/generated/prisma/client";
import { z } from "zod";
import { parseCairoDateTime } from "@/server/timezone";

export const uuidSchema = z.string().trim().toLowerCase().uuid();

export const sectionInputSchema = z
  .object({
    sectionNumber: z.coerce.number().int().positive(),
    responsibleAdminId: uuidSchema,
    day: z.enum(DayOfWeek),
    startMinute: z.coerce.number().int().min(480).max(1199),
    endMinute: z.coerce.number().int().min(481).max(1200),
    location: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .transform((value) => value.replace(/\s+/g, " ")),
    capacity: z.coerce.number().int().positive(),
  })
  .strict()
  .refine((data) => data.startMinute < data.endMinute, {
    message: "Section end time must be after its start time",
    path: ["endMinute"],
  });

const transferSchema = z
  .object({
    studentId: uuidSchema,
    targetSectionId: uuidSchema,
  })
  .strict();

const transfersSchema = z.array(transferSchema).superRefine((transfers, context) => {
  const seen = new Set<string>();
  transfers.forEach((transfer, index) => {
    if (seen.has(transfer.studentId)) {
      context.addIssue({
        code: "custom",
        message: "A student may only appear once in a transfer plan",
        path: [index, "studentId"],
      });
    }
    seen.add(transfer.studentId);
  });
});

const nullableLocalDateTimeSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable(),
);

const windowInputSchema = z
  .object({
    opensAt: nullableLocalDateTimeSchema,
    closesAt: nullableLocalDateTimeSchema,
  })
  .strict()
  .superRefine((data, context) => {
    if ((data.opensAt === null) !== (data.closesAt === null)) {
      context.addIssue({
        code: "custom",
        message: "Opening and closing times must both be set or both be empty",
        path: ["closesAt"],
      });
      return;
    }
    if (data.opensAt === null || data.closesAt === null) return;

    try {
      if (parseCairoDateTime(data.opensAt) >= parseCairoDateTime(data.closesAt)) {
        context.addIssue({
          code: "custom",
          message: "Closing time must be after opening time",
          path: ["closesAt"],
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Enter a valid Africa/Cairo date and time",
        path: ["closesAt"],
      });
    }
  });

export type SectionInput = z.infer<typeof sectionInputSchema>;
export type StudentTransfer = z.infer<typeof transferSchema>;
export type WindowType = "registration" | "switching";
export type ResumeMode = "normal" | "extend";

export function parseSectionInput(input: unknown) {
  return sectionInputSchema.parse(input);
}

export function parseTransfers(input: unknown) {
  return transfersSchema.parse(input);
}

export function parseExpectedUpdatedAt(input: unknown) {
  return z.coerce.date().parse(input);
}

export function parseWindowInput(input: unknown) {
  const data = windowInputSchema.parse(input);
  return {
    opensAt: data.opensAt ? parseCairoDateTime(data.opensAt) : null,
    closesAt: data.closesAt ? parseCairoDateTime(data.closesAt) : null,
  };
}

export function parseWindowType(input: unknown): WindowType {
  return z.enum(["registration", "switching"]).parse(input);
}

export function parseResumeMode(input: unknown): ResumeMode {
  return z.enum(["normal", "extend"]).parse(input);
}
