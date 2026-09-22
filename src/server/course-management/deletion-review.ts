import { createHmac, timingSafeEqual } from "node:crypto";
import type { DayOfWeek } from "@/generated/prisma/client";

export type DeletionReviewState = {
  actorId: string;
  courseId: string;
  sourceSectionId: string;
  transfers: Array<{ studentId: string; targetSectionId: string }>;
  removals: Array<{
    studentId: string;
    studentName: string;
    universityId: string | null;
  }>;
  targetCounts: Array<{
    targetSectionId: string;
    sectionNumber: number;
    transferCount: number;
    currentRegistrationCount: number;
    projectedRegistrationCount: number;
    capacity: number;
  }>;
  studentConflicts: Array<{
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
  }>;
};

export function createDeletionReviewToken(state: DeletionReviewState) {
  return createHmac("sha256", reviewSecret())
    .update(JSON.stringify(canonicalState(state)))
    .digest("base64url");
}

export function deletionReviewTokenMatches(
  state: DeletionReviewState,
  reviewedStateToken: string,
) {
  const expected = Buffer.from(createDeletionReviewToken(state));
  const provided = Buffer.from(reviewedStateToken);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

function canonicalState(state: DeletionReviewState): DeletionReviewState {
  return {
    actorId: state.actorId,
    courseId: state.courseId,
    sourceSectionId: state.sourceSectionId,
    transfers: [...state.transfers].sort((first, second) =>
      compare(
        `${first.studentId}:${first.targetSectionId}`,
        `${second.studentId}:${second.targetSectionId}`,
      ),
    ),
    removals: [...state.removals].sort((first, second) =>
      compare(first.studentId, second.studentId),
    ),
    targetCounts: [...state.targetCounts].sort((first, second) =>
      compare(first.targetSectionId, second.targetSectionId),
    ),
    studentConflicts: [...state.studentConflicts].sort((first, second) =>
      compare(
        `${first.studentId}:${first.conflictingSectionId}`,
        `${second.studentId}:${second.conflictingSectionId}`,
      ),
    ),
  };
}

function reviewSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for deletion review tokens");
  }
  return secret;
}

function compare(first: string, second: string) {
  return first < second ? -1 : first > second ? 1 : 0;
}
