import { describe, expect, it } from "vitest";
import { getAcademicLevel } from "@/lib/student";

describe("getAcademicLevel", () => {
  it.each([
    [0, 1],
    [31, 1],
    [32, 2],
    [65, 2],
    [66, 3],
    [98, 3],
    [99, 4],
    [150, 4],
  ] as const)("maps %i completed hours to level %i", (hours, level) => {
    expect(getAcademicLevel(hours)).toBe(level);
  });
});
