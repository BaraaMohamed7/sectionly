import { UserRole } from "@/generated/prisma/client";
import { assertCourseManagementAccess } from "@/server/course-management/authorization";
import { CourseManagementError } from "@/server/course-management/errors";
import { uuidSchema } from "@/server/course-management/validation";
import { db, type DatabaseClient } from "@/server/db";

export async function listManageableCourses(
  actorId: string,
  database: DatabaseClient = db,
) {
  const actor = await getManager(database, uuidSchema.parse(actorId));

  return database.course.findMany({
    where:
      actor.role === UserRole.ADMIN
        ? { admins: { some: { adminId: actor.id } } }
        : undefined,
    select: {
      id: true,
      code: true,
      nameAr: true,
      nameEn: true,
      creditHours: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      registrationPaused: true,
      switchingOpensAt: true,
      switchingClosesAt: true,
      switchingPaused: true,
      _count: { select: { sections: true, enrollments: true } },
      admins: {
        select: {
          isPrimary: true,
          admin: { select: { id: true, adminName: true } },
        },
        orderBy: [{ isPrimary: "desc" }, { admin: { adminName: "asc" } }],
      },
    },
    orderBy: { code: "asc" },
  });
}

export async function getManageableCourse(
  actorId: string,
  courseId: string,
  database: DatabaseClient = db,
) {
  const actor = uuidSchema.parse(actorId);
  const course = uuidSchema.parse(courseId);
  await assertCourseManagementAccess(database, actor, course);

  return database.course.findUnique({
    where: { id: course },
    select: {
      id: true,
      code: true,
      nameAr: true,
      nameEn: true,
      creditHours: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      registrationPaused: true,
      registrationPausedAt: true,
      switchingOpensAt: true,
      switchingClosesAt: true,
      switchingPaused: true,
      switchingPausedAt: true,
      admins: {
        select: {
          isPrimary: true,
          admin: {
            select: {
              id: true,
              adminName: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ isPrimary: "desc" }, { admin: { adminName: "asc" } }],
      },
      sections: {
        select: {
          id: true,
          sectionNumber: true,
          responsibleAdminId: true,
          day: true,
          startMinute: true,
          endMinute: true,
          location: true,
          capacity: true,
          isPublished: true,
          updatedAt: true,
          responsibleAdmin: {
            select: { admin: { select: { id: true, adminName: true } } },
          },
          registrations: {
            select: {
              studentId: true,
              enrollment: {
                select: {
                  student: {
                    select: { fullName: true, universityId: true },
                  },
                },
              },
            },
            orderBy: { enrollment: { student: { fullName: "asc" } } },
          },
        },
        orderBy: { sectionNumber: "asc" },
      },
    },
  });
}

async function getManager(database: DatabaseClient, actorId: string) {
  const actor = await database.user.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
    },
  });
  if (
    !actor ||
    (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) ||
    !actor.isActive ||
    actor.mustChangePassword
  ) {
    throw new CourseManagementError("FORBIDDEN");
  }
  return actor;
}
