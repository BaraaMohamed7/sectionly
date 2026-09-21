import { describe, expect, it } from "vitest";
import { getCourseWindowStatuses } from "@/server/course-management/window-status";

describe("course window status", () => {
  const now = new Date("2026-09-22T10:00:00.000Z");

  it("keeps registration and switching semantics independent", () => {
    expect(
      getCourseWindowStatuses(
        {
          registrationOpensAt: new Date("2026-09-22T09:00:00.000Z"),
          registrationClosesAt: new Date("2026-09-22T11:00:00.000Z"),
          registrationPaused: false,
          switchingOpensAt: new Date("2026-09-23T09:00:00.000Z"),
          switchingClosesAt: new Date("2026-09-23T11:00:00.000Z"),
          switchingPaused: false,
        },
        now,
      ),
    ).toEqual({ registration: "OPEN", switching: "UPCOMING" });
  });

  it("treats null windows as closed and pauses as distinct from closed", () => {
    expect(
      getCourseWindowStatuses(
        {
          registrationOpensAt: null,
          registrationClosesAt: null,
          registrationPaused: false,
          switchingOpensAt: new Date("2026-09-22T09:00:00.000Z"),
          switchingClosesAt: new Date("2026-09-22T11:00:00.000Z"),
          switchingPaused: true,
        },
        now,
      ),
    ).toEqual({ registration: "CLOSED", switching: "PAUSED" });
  });
});
