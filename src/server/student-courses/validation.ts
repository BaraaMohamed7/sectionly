import { z } from "zod";

export const courseIdSchema = z.string().trim().toLowerCase().uuid();
const courseIdsSchema = z.array(courseIdSchema);

export function parseCourseIds(input: unknown) {
  return [...new Set(courseIdsSchema.parse(input))];
}
