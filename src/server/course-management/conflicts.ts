import type { DayOfWeek, Prisma } from "@/generated/prisma/client";
import type {
  SectionInput,
  StudentTransfer,
} from "@/server/course-management/validation";

export type OperationalConflict = {
  sectionId: string;
  courseId: string;
  courseCode: string;
  sectionNumber: number;
  day: DayOfWeek;
  startMinute: number;
  endMinute: number;
  location: string;
  responsibleAdminId: string;
  responsibleAdminName: string;
};

export type StudentScheduleConflict = {
  studentId: string;
  studentName: string;
  universityId: string | null;
  conflictingCourseId: string;
  conflictingCourseCode: string;
  conflictingCourseName: string;
  conflictingSectionId: string;
  conflictingSectionNumber: number;
  day: DayOfWeek;
  startMinute: number;
  endMinute: number;
};

export type ConflictPreview = {
  responsibleAdminConflicts: OperationalConflict[];
  locationConflicts: OperationalConflict[];
  studentConflicts: StudentScheduleConflict[];
};

export function emptyConflictPreview(): ConflictPreview {
  return {
    responsibleAdminConflicts: [],
    locationConflicts: [],
    studentConflicts: [],
  };
}

export function hasConflictWarnings(preview: ConflictPreview) {
  return (
    preview.responsibleAdminConflicts.length > 0 ||
    preview.locationConflicts.length > 0 ||
    preview.studentConflicts.length > 0
  );
}

export async function findOperationalConflicts(
  transaction: Prisma.TransactionClient,
  input: SectionInput,
  excludedSectionId?: string,
) {
  const sections = await transaction.section.findMany({
    where: {
      id: excludedSectionId ? { not: excludedSectionId } : undefined,
      day: input.day,
      startMinute: { lt: input.endMinute },
      endMinute: { gt: input.startMinute },
      OR: [
        { responsibleAdminId: input.responsibleAdminId },
        { location: { equals: input.location, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      courseId: true,
      sectionNumber: true,
      day: true,
      startMinute: true,
      endMinute: true,
      location: true,
      responsibleAdminId: true,
      course: { select: { code: true } },
      responsibleAdmin: {
        select: { admin: { select: { fullName: true } } },
      },
    },
    orderBy: { id: "asc" },
  });
  const mapped = sections.map((section) => ({
    sectionId: section.id,
    courseId: section.courseId,
    courseCode: section.course.code,
    sectionNumber: section.sectionNumber,
    day: section.day,
    startMinute: section.startMinute,
    endMinute: section.endMinute,
    location: section.location,
    responsibleAdminId: section.responsibleAdminId,
    responsibleAdminName: section.responsibleAdmin.admin.fullName,
  }));

  return {
    responsibleAdminConflicts: mapped.filter(
      (section) => section.responsibleAdminId === input.responsibleAdminId,
    ),
    locationConflicts: mapped.filter(
      (section) =>
        section.location.toLocaleLowerCase() === input.location.toLocaleLowerCase(),
    ),
  };
}

export async function findStudentConflictsForSectionEdit(
  transaction: Prisma.TransactionClient,
  sourceSectionId: string,
  input: Pick<SectionInput, "day" | "startMinute" | "endMinute">,
) {
  const sourceRegistrations = await transaction.sectionRegistration.findMany({
    where: { sectionId: sourceSectionId },
    select: { studentId: true },
  });
  const studentIds = sourceRegistrations.map(({ studentId }) => studentId);
  if (studentIds.length === 0) return [];

  const conflicts = await transaction.sectionRegistration.findMany({
    where: {
      studentId: { in: studentIds },
      sectionId: { not: sourceSectionId },
      section: {
        day: input.day,
        startMinute: { lt: input.endMinute },
        endMinute: { gt: input.startMinute },
      },
    },
    select: {
      studentId: true,
      enrollment: {
        select: {
          student: {
            select: { fullName: true, universityId: true },
          },
        },
      },
      section: {
        select: {
          id: true,
          sectionNumber: true,
          day: true,
          startMinute: true,
          endMinute: true,
          course: { select: { id: true, code: true, nameEn: true } },
        },
      },
    },
  });

  return conflicts.map((registration) =>
    mapStudentConflict(registration.studentId, registration.enrollment.student, registration.section),
  );
}

export async function findStudentTransferConflicts(
  transaction: Prisma.TransactionClient,
  sourceSectionId: string,
  transfers: StudentTransfer[],
  targetSections: Map<
    string,
    {
      id: string;
      day: DayOfWeek;
      startMinute: number;
      endMinute: number;
    }
  >,
) {
  if (transfers.length === 0) return [];

  const studentIds = transfers.map(({ studentId }) => studentId);
  const registrations = await transaction.sectionRegistration.findMany({
    where: {
      studentId: { in: studentIds },
      sectionId: { not: sourceSectionId },
    },
    select: {
      studentId: true,
      enrollment: {
        select: {
          student: { select: { fullName: true, universityId: true } },
        },
      },
      section: {
        select: {
          id: true,
          sectionNumber: true,
          day: true,
          startMinute: true,
          endMinute: true,
          course: { select: { id: true, code: true, nameEn: true } },
        },
      },
    },
  });
  const targetByStudent = new Map(
    transfers.map((transfer) => [
      transfer.studentId,
      targetSections.get(transfer.targetSectionId)!,
    ]),
  );

  return registrations
    .filter((registration) => {
      const target = targetByStudent.get(registration.studentId);
      return target && sectionsConflict(target, registration.section);
    })
    .map((registration) =>
      mapStudentConflict(
        registration.studentId,
        registration.enrollment.student,
        registration.section,
      ),
    );
}

export function sectionsConflict(
  first: { day: DayOfWeek; startMinute: number; endMinute: number },
  second: { day: DayOfWeek; startMinute: number; endMinute: number },
) {
  return (
    first.day === second.day &&
    first.startMinute < second.endMinute &&
    first.endMinute > second.startMinute
  );
}

function mapStudentConflict(
  studentId: string,
  student: { fullName: string; universityId: string | null },
  section: {
    id: string;
    sectionNumber: number;
    day: DayOfWeek;
    startMinute: number;
    endMinute: number;
    course: { id: string; code: string; nameEn: string };
  },
): StudentScheduleConflict {
  return {
    studentId,
    studentName: student.fullName,
    universityId: student.universityId,
    conflictingCourseId: section.course.id,
    conflictingCourseCode: section.course.code,
    conflictingCourseName: section.course.nameEn,
    conflictingSectionId: section.id,
    conflictingSectionNumber: section.sectionNumber,
    day: section.day,
    startMinute: section.startMinute,
    endMinute: section.endMinute,
  };
}
