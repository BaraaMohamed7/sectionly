import { describe, expect, it } from "vitest";
import {
  formatCairoDateTimeInput,
  parseCairoDateTime,
} from "@/server/timezone";
import { generateTemporaryPassword } from "@/server/super-admin/temporary-password";
import { parseCourseInput } from "@/server/super-admin/validation";

const validCourse = {
  code: " cs301 ",
  nameAr: " النظم الموزعة ",
  nameEn: " Distributed Systems ",
  creditHours: 3,
  registrationOpensAt: "2026-09-20T20:00",
  registrationClosesAt: "2026-09-23T20:00",
  switchingOpensAt: null,
  switchingClosesAt: null,
  registrationPaused: false,
  switchingPaused: false,
};

describe("Super Admin foundation helpers", () => {
  it("generates high-entropy bcrypt-compatible temporary passwords", () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();

    expect(first).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(second).not.toBe(first);
    expect(new TextEncoder().encode(first).byteLength).toBeLessThanOrEqual(72);
  });

  it("parses and formats institutional times in Africa/Cairo", () => {
    const winter = parseCairoDateTime("2026-01-15T12:00");
    const summer = parseCairoDateTime("2026-07-15T12:00");

    expect(winter.toISOString()).toBe("2026-01-15T10:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-15T09:00:00.000Z");
    expect(formatCairoDateTimeInput(summer)).toBe("2026-07-15T12:00");
  });

  it("normalizes a valid course and converts its windows", () => {
    const parsed = parseCourseInput(validCourse);

    expect(parsed).toMatchObject({
      code: "CS301",
      nameAr: "النظم الموزعة",
      nameEn: "Distributed Systems",
      creditHours: 3,
      switchingOpensAt: null,
      switchingClosesAt: null,
    });
    expect(parsed.registrationOpensAt?.toISOString()).toBe(
      "2026-09-20T17:00:00.000Z",
    );
  });

  it("rejects partial and reversed course windows", () => {
    expect(() =>
      parseCourseInput({ ...validCourse, registrationClosesAt: null }),
    ).toThrow();
    expect(() =>
      parseCourseInput({
        ...validCourse,
        registrationClosesAt: "2026-09-19T20:00",
      }),
    ).toThrow();
  });
});
