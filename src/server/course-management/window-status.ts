export type WindowStatus = "CLOSED" | "UPCOMING" | "OPEN" | "PAUSED";

type CourseWindows = {
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  registrationPaused: boolean;
  switchingOpensAt: Date | null;
  switchingClosesAt: Date | null;
  switchingPaused: boolean;
};

export function getCourseWindowStatuses(course: CourseWindows, now = new Date()) {
  return {
    registration: getWindowStatus(
      course.registrationOpensAt,
      course.registrationClosesAt,
      course.registrationPaused,
      now,
    ),
    switching: getWindowStatus(
      course.switchingOpensAt,
      course.switchingClosesAt,
      course.switchingPaused,
      now,
    ),
  };
}

function getWindowStatus(
  opensAt: Date | null,
  closesAt: Date | null,
  paused: boolean,
  now: Date,
): WindowStatus {
  if (paused) return "PAUSED";
  if (!opensAt || !closesAt) return "CLOSED";
  if (now < opensAt) return "UPCOMING";
  if (now >= closesAt) return "CLOSED";
  return "OPEN";
}
