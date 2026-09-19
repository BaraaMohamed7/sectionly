import { describe, expect, it } from "vitest";
import {
  loginSchema,
  passwordSchema,
  registerStudentSchema,
} from "@/server/auth/validation";

const validRegistration = {
  fullName: "Baraa Mohamed",
  universityId: "20240001",
  email: "student@example.com",
  password: "correct horse battery staple",
  completedCreditHours: 32,
  isTransferredThisYear: false,
};

describe("authentication validation", () => {
  it("normalizes registration and login email addresses", () => {
    expect(
      registerStudentSchema.parse({
        ...validRegistration,
        email: "  STUDENT@EXAMPLE.COM ",
      }).email,
    ).toBe("student@example.com");

    expect(
      loginSchema.parse({
        email: "  STUDENT@EXAMPLE.COM ",
        password: validRegistration.password,
      }).email,
    ).toBe("student@example.com");
  });

  it("accepts passwords up to 72 UTF-8 bytes", () => {
    expect(passwordSchema.safeParse("ا".repeat(36)).success).toBe(true);
    expect(passwordSchema.safeParse("ا".repeat(37)).success).toBe(false);
  });

  it("rejects short passwords and invalid completed hours", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(
      registerStudentSchema.safeParse({
        ...validRegistration,
        completedCreditHours: -1,
      }).success,
    ).toBe(false);
    expect(
      registerStudentSchema.safeParse({
        ...validRegistration,
        completedCreditHours: 31.5,
      }).success,
    ).toBe(false);
    expect(
      registerStudentSchema.safeParse({
        ...validRegistration,
        completedCreditHours: "",
      }).success,
    ).toBe(false);
  });

  it("rejects public role or account-state fields", () => {
    expect(
      registerStudentSchema.safeParse({
        ...validRegistration,
        role: "SUPER_ADMIN",
        isActive: true,
      }).success,
    ).toBe(false);
  });
});
