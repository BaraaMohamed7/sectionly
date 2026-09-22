import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DayOfWeek,
  PrismaClient,
  UserRole,
} from "../../src/generated/prisma/client";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

describe("PostgreSQL database foundation", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects through the Prisma PostgreSQL adapter", async () => {
    const result = await prisma.$queryRaw<Array<{ value: number }>>`
      SELECT 1 AS value
    `;

    expect(result).toEqual([{ value: 1 }]);
  });

  it("enforces role-specific Admin naming", async () => {
    await expect(
      prisma.user.create({
        data: {
          email: `student-${randomUUID()}@example.com`,
          passwordHash: "not-a-real-password-hash",
          role: UserRole.STUDENT,
          adminName: "Not an Admin",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.user.create({
        data: {
          email: `admin-without-name-${randomUUID()}@example.com`,
          passwordHash: "not-a-real-password-hash",
          role: UserRole.ADMIN,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects partially configured registration windows", async () => {
    await expect(
      prisma.course.create({
        data: {
          code: `C${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          nameAr: "مادة اختبار",
          nameEn: "Test Course",
          creditHours: 3,
          registrationOpensAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces positive course, section, and time values", async () => {
    await expect(
      prisma.course.create({
        data: {
          code: `P${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          nameAr: "مادة اختبار",
          nameEn: "Test Course",
          creditHours: 0,
        },
      }),
    ).rejects.toThrow();

    const suffix = randomUUID();
    const [course, admin] = await Promise.all([
      prisma.course.create({
        data: {
          code: `V${suffix.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          nameAr: "مادة اختبار",
          nameEn: "Test Course",
          creditHours: 3,
        },
      }),
      prisma.user.create({
        data: {
          adminName: "Section Admin",
          email: `section-admin-${suffix}@example.com`,
          passwordHash: "not-a-real-password-hash",
          role: UserRole.ADMIN,
        },
      }),
    ]);

    await prisma.courseAdmin.create({
      data: { courseId: course.id, adminId: admin.id },
    });

    await expect(
      prisma.section.create({
        data: {
          courseId: course.id,
          sectionNumber: 0,
          responsibleAdminId: admin.id,
          day: DayOfWeek.MONDAY,
          startMinute: 420,
          endMinute: 480,
          location: "Room 1",
          capacity: 0,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.section.create({
        data: {
          courseId: course.id,
          sectionNumber: 1,
          responsibleAdminId: admin.id,
          day: DayOfWeek.MONDAY,
          startMinute: 480,
          endMinute: 540,
          location: "  Lab   3  ",
          capacity: 20,
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces canonical email and course code storage", async () => {
    await expect(
      prisma.user.create({
        data: {
          adminName: "Uppercase Email Admin",
          email: `ADMIN-${randomUUID()}@EXAMPLE.COM`,
          passwordHash: "not-a-real-password-hash",
          role: UserRole.ADMIN,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.course.create({
        data: {
          code: `lower-${randomUUID().slice(0, 8)}`,
          nameAr: "مادة اختبار",
          nameEn: "Test Course",
          creditHours: 3,
        },
      }),
    ).rejects.toThrow();
  });

  it("allows at most one primary admin per course", async () => {
    const suffix = randomUUID();
    const [course, firstAdmin, secondAdmin] = await Promise.all([
      prisma.course.create({
        data: {
          code: `C${suffix.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          nameAr: "مادة اختبار",
          nameEn: "Test Course",
          creditHours: 3,
        },
      }),
      prisma.user.create({
        data: {
          adminName: "First Admin",
          email: `admin-one-${suffix}@example.com`,
          passwordHash: "not-a-real-password-hash",
          role: UserRole.ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          adminName: "Second Admin",
          email: `admin-two-${suffix}@example.com`,
          passwordHash: "not-a-real-password-hash",
          role: UserRole.ADMIN,
        },
      }),
    ]);

    await prisma.courseAdmin.create({
      data: {
        courseId: course.id,
        adminId: firstAdmin.id,
        isPrimary: true,
      },
    });

    await expect(
      prisma.courseAdmin.create({
        data: {
          courseId: course.id,
          adminId: secondAdmin.id,
          isPrimary: true,
        },
      }),
    ).rejects.toThrow();
  });

  it("requires a section's responsible admin to be assigned to its course", async () => {
    const suffix = randomUUID();
    const [course, assignedAdmin, unassignedAdmin] = await Promise.all([
      prisma.course.create({
        data: {
          code: `S${suffix.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          nameAr: "مادة اختبار",
          nameEn: "Test Course",
          creditHours: 3,
        },
      }),
      prisma.user.create({
        data: {
          adminName: "Assigned Admin",
          email: `assigned-${suffix}@example.com`,
          passwordHash: "not-a-real-password-hash",
          role: UserRole.ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          adminName: "Unassigned Admin",
          email: `unassigned-${suffix}@example.com`,
          passwordHash: "not-a-real-password-hash",
          role: UserRole.ADMIN,
        },
      }),
    ]);

    await prisma.courseAdmin.create({
      data: {
        courseId: course.id,
        adminId: assignedAdmin.id,
      },
    });

    await expect(
      prisma.section.create({
        data: {
          courseId: course.id,
          sectionNumber: 1,
          responsibleAdminId: unassignedAdmin.id,
          day: DayOfWeek.SATURDAY,
          startMinute: 480,
          endMinute: 600,
          location: "Room 2",
          capacity: 30,
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces enrollment and section course consistency on registrations", async () => {
    const suffix = randomUUID();
    const studentUser = await prisma.user.create({
      data: {
        email: `registered-${suffix}@example.com`,
        passwordHash: "not-a-real-password-hash",
        role: UserRole.STUDENT,
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        fullName: "Registered Student",
        universityId: `U-${suffix}`,
        completedCreditHours: 0,
        isTransferredThisYear: false,
      },
    });
    const admin = await prisma.user.create({
      data: {
        adminName: "Course Admin",
        email: `registration-admin-${suffix}@example.com`,
        passwordHash: "not-a-real-password-hash",
        role: UserRole.ADMIN,
      },
    });
    const [firstCourse, secondCourse] = await Promise.all([
      prisma.course.create({
        data: {
          code: `R${suffix.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          nameAr: "المادة الأولى",
          nameEn: "First Course",
          creditHours: 3,
        },
      }),
      prisma.course.create({
        data: {
          code: `T${suffix.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          nameAr: "المادة الثانية",
          nameEn: "Second Course",
          creditHours: 3,
        },
      }),
    ]);

    await prisma.courseAdmin.createMany({
      data: [
        { courseId: firstCourse.id, adminId: admin.id },
        { courseId: secondCourse.id, adminId: admin.id },
      ],
    });
    await prisma.courseEnrollment.createMany({
      data: [
        { studentId: student.id, courseId: firstCourse.id },
        { studentId: student.id, courseId: secondCourse.id },
      ],
    });
    const firstSection = await prisma.section.create({
      data: {
        courseId: firstCourse.id,
        sectionNumber: 1,
        responsibleAdminId: admin.id,
        day: DayOfWeek.SUNDAY,
        startMinute: 600,
        endMinute: 720,
        location: "Room 3",
        capacity: 30,
      },
    });

    await expect(
      prisma.sectionRegistration.create({
        data: {
          studentId: student.id,
          courseId: secondCourse.id,
          sectionId: firstSection.id,
        },
      }),
    ).rejects.toThrow();

    const studentWithoutEnrollmentUser = await prisma.user.create({
      data: {
        email: `not-enrolled-${suffix}@example.com`,
        passwordHash: "not-a-real-password-hash",
        role: UserRole.STUDENT,
      },
    });
    const studentWithoutEnrollment = await prisma.student.create({
      data: {
        userId: studentWithoutEnrollmentUser.id,
        fullName: "Student Without Enrollment",
        universityId: `N-${suffix}`,
        completedCreditHours: 0,
        isTransferredThisYear: false,
      },
    });

    await expect(
      prisma.sectionRegistration.create({
        data: {
          studentId: studentWithoutEnrollment.id,
          courseId: firstCourse.id,
          sectionId: firstSection.id,
        },
      }),
    ).rejects.toThrow();
  });
});
