import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCourseIds } from "@/server/student-courses/validation";

describe("student course ID validation", () => {
  it("normalizes and deduplicates course IDs", () => {
    const id = randomUUID();

    expect(parseCourseIds([id, id.toUpperCase(), ` ${id} `])).toEqual([id]);
  });

  it("rejects malformed course IDs", () => {
    expect(() => parseCourseIds(["not-a-course-id"])).toThrow();
  });
});
