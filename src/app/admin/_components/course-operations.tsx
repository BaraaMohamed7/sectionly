"use client";

import { useActionState, useState } from "react";
import type { DayOfWeek } from "@/generated/prisma/client";
import {
  deleteSectionAction,
  INITIAL_COURSE_MANAGEMENT_STATE,
  manageCourseWindowAction,
  saveSectionAction,
  setSectionPublicationAction,
  type CourseManagementActionState,
} from "@/app/admin/course-management-actions";
import type { getManageableCourse } from "@/server/course-management/queries";

type Course = NonNullable<Awaited<ReturnType<typeof getManageableCourse>>>;
type Section = Course["sections"][number];

const DAYS: Array<{ value: DayOfWeek; label: string }> = [
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
];

export function CourseOperations({ course }: { course: Course }) {
  return (
    <>
      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">Weekly meetings</p>
            <h2>{course.sections.length} sections</h2>
          </div>
          <p>
            Conflicts are warnings. Capacity reductions and stale edits are
            always blocked.
          </p>
        </div>
        <SectionForm course={course} />
        <div className="admin-section-list" role="table" aria-label="Course sections">
          {course.sections.length > 0 ? (
            <div className="admin-section-table-head" role="row">
              <span>Section schedule and operation</span>
              <span>Actions</span>
            </div>
          ) : null}
          {course.sections.map((section) => (
            <SectionCard course={course} key={section.id} section={section} />
          ))}
          {course.sections.length === 0 ? (
            <p className="admin-empty-state">No weekly sections yet.</p>
          ) : null}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">Availability controls</p>
            <h2>Registration windows</h2>
          </div>
          <p>All entered times are interpreted in Africa/Cairo.</p>
        </div>
        <div className="admin-window-grid">
          <WindowCard
            courseId={course.id}
            type="registration"
            title="Registration"
            opensAt={formatCairoInput(course.registrationOpensAt)}
            closesAt={formatCairoInput(course.registrationClosesAt)}
            paused={course.registrationPaused}
            pausedAt={course.registrationPausedAt}
          />
          <WindowCard
            courseId={course.id}
            type="switching"
            title="Switching"
            opensAt={formatCairoInput(course.switchingOpensAt)}
            closesAt={formatCairoInput(course.switchingClosesAt)}
            paused={course.switchingPaused}
            pausedAt={course.switchingPausedAt}
          />
        </div>
      </section>
    </>
  );
}

function SectionCard({ course, section }: { course: Course; section: Section }) {
  const [publicationState, publicationAction, publicationPending] = useActionState(
    setSectionPublicationAction,
    INITIAL_COURSE_MANAGEMENT_STATE,
  );

  return (
    <article className="admin-section-card" role="row">
      <div className="admin-section-summary">
        <div className="admin-section-number">{section.sectionNumber}</div>
        <div>
          <div className="admin-badges">
            <span
              className={`admin-badge ${
                section.isPublished ? "admin-badge-green" : "admin-badge-muted"
              }`}
            >
              {section.isPublished ? "Published" : "Unpublished"}
            </span>
            <span className="admin-badge admin-badge-blue">
              {section.registrations.length}/{section.capacity} seats
            </span>
          </div>
          <h3>
            {dayLabel(section.day)} · {formatMinute(section.startMinute)}–
            {formatMinute(section.endMinute)}
          </h3>
          <p>
            {section.location} · Dr. {section.responsibleAdmin.admin.adminName}
          </p>
        </div>
      </div>

      <div className="admin-button-row">
        <form action={publicationAction}>
          <input type="hidden" name="courseId" value={course.id} />
          <input type="hidden" name="sectionId" value={section.id} />
          <input
            type="hidden"
            name="publish"
            value={section.isPublished ? "false" : "true"}
          />
          <button
            className="admin-button admin-button-secondary"
            disabled={publicationPending}
            type="submit"
          >
            {section.isPublished ? "Unpublish" : "Publish"}
          </button>
        </form>
        <details className="admin-operation-disclosure">
          <summary>Edit details</summary>
          <SectionForm course={course} section={section} />
        </details>
        <details className="admin-operation-disclosure admin-danger-disclosure">
          <summary>Delete / transfer</summary>
          <DeleteSectionForm course={course} section={section} />
        </details>
      </div>
      <ActionResult state={publicationState} />
    </article>
  );
}

function SectionForm({ course, section }: { course: Course; section?: Section }) {
  const [state, action, pending] = useActionState(
    saveSectionAction,
    INITIAL_COURSE_MANAGEMENT_STATE,
  );

  return (
    <form action={action} className="admin-form admin-section-form">
      <input type="hidden" name="courseId" value={course.id} />
      {section ? (
        <>
          <input type="hidden" name="sectionId" value={section.id} />
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={section.updatedAt.toISOString()}
          />
        </>
      ) : null}
      {state.status === "warning" && state.warnings ? (
        <input type="hidden" name="confirmConflicts" value="true" />
      ) : null}
      <div className="admin-section-form-grid">
        <label>
          Section
          <input
            name="sectionNumber"
            type="number"
            min={1}
            required
            defaultValue={section?.sectionNumber ?? course.sections.length + 1}
          />
        </label>
        <label>
          Responsible Admin
          <select
            name="responsibleAdminId"
            required
            defaultValue={section?.responsibleAdminId}
          >
            <option value="">Select Admin</option>
            {course.admins.map(({ admin }) => (
              <option value={admin.id} key={admin.id}>
                Dr. {admin.adminName}{admin.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Day
          <select name="day" required defaultValue={section?.day ?? "SUNDAY"}>
            {DAYS.map((day) => (
              <option value={day.value} key={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Starts
          <input
            name="startTime"
            type="time"
            min="08:00"
            max="19:59"
            required
            defaultValue={formatMinute(section?.startMinute ?? 480)}
          />
        </label>
        <label>
          Ends
          <input
            name="endTime"
            type="time"
            min="08:01"
            max="20:00"
            required
            defaultValue={formatMinute(section?.endMinute ?? 540)}
          />
        </label>
        <label>
          Location
          <input
            name="location"
            required
            maxLength={120}
            defaultValue={section?.location}
          />
        </label>
        <label>
          Capacity
          <input
            name="capacity"
            type="number"
            min={section?.capacity ?? 1}
            required
            defaultValue={section?.capacity ?? 30}
          />
        </label>
      </div>
      <button className="admin-button" disabled={pending} type="submit">
        {pending
          ? "Checking..."
          : state.status === "warning" && state.warnings
            ? "Override warnings and save"
            : section
              ? "Save section"
              : "Create section"}
      </button>
      <ActionResult state={state} />
    </form>
  );
}

function DeleteSectionForm({ course, section }: { course: Course; section: Section }) {
  const [state, action, pending] = useActionState(
    deleteSectionAction,
    INITIAL_COURSE_MANAGEMENT_STATE,
  );
  const [transferSelections, setTransferSelections] = useState<
    Record<string, string>
  >({});
  const targets = course.sections.filter((candidate) => candidate.id !== section.id);
  const selectedTransfers = Object.entries(transferSelections)
    .filter((entry): entry is [string, string] => entry[1] !== "")
    .map(([studentId, targetSectionId]) => ({ studentId, targetSectionId }));
  const previewMatchesSelection = Boolean(
    state.deletionPlan &&
      transferPlanKey(state.deletionPlan.transfers) ===
        transferPlanKey(selectedTransfers),
  );
  const activePlan = previewMatchesSelection ? state.deletionPlan : undefined;

  return (
    <form action={action} className="admin-form admin-delete-form">
      <input type="hidden" name="courseId" value={course.id} />
      <input type="hidden" name="sectionId" value={section.id} />
      {activePlan ? (
        <input
          type="hidden"
          name="reviewedStateToken"
          value={activePlan.reviewedStateToken}
        />
      ) : null}
      <p className="admin-destructive-note">
        Deleting removes registrations left here, but never removes a student’s
        course selection. Optionally transfer students first.
      </p>
      {section.registrations.map((registration) => (
        <label key={registration.studentId}>
          {registration.enrollment.student.fullName}
          <input type="hidden" name="studentId" value={registration.studentId} />
          <select
            name={`transfer-${registration.studentId}`}
            value={transferSelections[registration.studentId] ?? ""}
            onChange={(event) =>
              setTransferSelections((current) => ({
                ...current,
                [registration.studentId]: event.target.value,
              }))
            }
          >
            <option value="">Remove section registration</option>
            {targets.map((target) => (
              <option value={target.id} key={target.id}>
                Transfer to section {target.sectionNumber} ({target.registrations.length}/
                {target.capacity})
              </option>
            ))}
          </select>
        </label>
      ))}
      {state.deletionPlan && !previewMatchesSelection ? (
        <p className="admin-action-result admin-action-result-warning" role="status">
          Transfer selections changed. Preview the updated plan before deletion.
        </p>
      ) : null}
      {activePlan ? (
        <div className="admin-confirmation-panel">
          <strong>Destructive confirmation</strong>
          <p>
            {activePlan.transferCount} transfers; {activePlan.removalCount}{" "}
            registrations removed.
          </p>
          {activePlan.transfers.map((transfer) => (
            <span key={transfer.studentId}>
              {section.registrations.find(
                (registration) => registration.studentId === transfer.studentId,
              )?.enrollment.student.fullName ?? transfer.studentId}{" "}
              → section {course.sections.find(
                (item) => item.id === transfer.targetSectionId,
              )?.sectionNumber}
            </span>
          ))}
          {activePlan.removals.map((removal) => (
            <span key={removal.studentId}>
              {removal.studentName} → remove section registration
            </span>
          ))}
          {activePlan.targetCounts.map((target) => (
            <span key={target.targetSectionId}>
              Section {target.sectionNumber}: {target.currentRegistrationCount} current +{" "}
              {target.transferCount} incoming = {target.projectedRegistrationCount}/
              {target.capacity}
            </span>
          ))}
        </div>
      ) : null}
      <ConflictWarnings
        warnings={
          activePlan
            ? {
                responsibleAdminConflicts: [],
                locationConflicts: [],
                studentConflicts: activePlan.studentConflicts,
              }
            : state.warnings
        }
      />
      <div className="admin-button-row">
        <button
          className="admin-button admin-button-warning"
          disabled={pending}
          name="intent"
          value="preview-delete"
          type="submit"
        >
          Preview deletion
        </button>
        {activePlan ? (
          <button
            className="admin-button admin-button-danger"
            disabled={pending}
            name="intent"
            value="confirm-delete"
            type="submit"
          >
            Confirm permanent deletion
          </button>
        ) : null}
      </div>
      <ActionResult state={state} showWarnings={false} />
    </form>
  );
}

function WindowCard({
  courseId,
  type,
  title,
  opensAt,
  closesAt,
  paused,
  pausedAt,
}: {
  courseId: string;
  type: "registration" | "switching";
  title: string;
  opensAt: string;
  closesAt: string;
  paused: boolean;
  pausedAt: Date | null;
}) {
  const [state, action, pending] = useActionState(
    manageCourseWindowAction,
    INITIAL_COURSE_MANAGEMENT_STATE,
  );
  const configured = opensAt !== "" && closesAt !== "";

  return (
    <form action={action} className="admin-form admin-window-card">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="windowType" value={type} />
      <header>
        <div>
          <p className="admin-eyebrow">{type} window</p>
          <h3>{title}</h3>
        </div>
        <span
          className={`admin-badge ${
            paused
              ? "admin-badge-amber"
              : configured
                ? "admin-badge-green"
                : "admin-badge-muted"
          }`}
        >
          {paused ? "Paused" : configured ? "Configured" : "Not configured"}
        </span>
      </header>
      {pausedAt ? (
        <p className="admin-window-note">
          Paused since {pausedAt.toLocaleString("en-GB", { timeZone: "Africa/Cairo" })}
        </p>
      ) : null}
      <label>
        Opens
        <input name="opensAt" type="datetime-local" defaultValue={opensAt} />
      </label>
      <label>
        Closes
        <input name="closesAt" type="datetime-local" defaultValue={closesAt} />
      </label>
      <div className="admin-button-row">
        <button
          className="admin-button admin-button-secondary"
          disabled={pending}
          name="intent"
          value="update"
          type="submit"
        >
          Save dates
        </button>
        {!paused ? (
          <button
            className="admin-button admin-button-warning"
            disabled={pending || !configured}
            name="intent"
            value="pause"
            type="submit"
          >
            Pause
          </button>
        ) : (
          <>
            <button
              className="admin-button"
              disabled={pending}
              name="intent"
              value="resume"
              type="submit"
            >
              Resume
            </button>
            <button
              className="admin-button admin-button-secondary"
              disabled={pending}
              name="intent"
              value="resume-extend"
              type="submit"
            >
              Resume + extend
            </button>
          </>
        )}
      </div>
      <ActionResult state={state} />
    </form>
  );
}

function ActionResult({
  state,
  showWarnings = true,
}: {
  state: CourseManagementActionState;
  showWarnings?: boolean;
}) {
  if (state.status === "idle") return null;
  return (
    <>
      <p
        className={`admin-action-result admin-action-result-${state.status}`}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message}
      </p>
      {showWarnings ? <ConflictWarnings warnings={state.warnings} /> : null}
    </>
  );
}

function ConflictWarnings({
  warnings,
}: {
  warnings?: CourseManagementActionState["warnings"];
}) {
  if (!warnings) return null;
  const count =
    warnings.responsibleAdminConflicts.length +
    warnings.locationConflicts.length +
    warnings.studentConflicts.length;
  if (count === 0) return null;
  const studentGroups = new Map<
    string,
    { conflict: (typeof warnings.studentConflicts)[number]; count: number }
  >();
  for (const conflict of warnings.studentConflicts) {
    const current = studentGroups.get(conflict.conflictingSectionId);
    studentGroups.set(conflict.conflictingSectionId, {
      conflict,
      count: (current?.count ?? 0) + 1,
    });
  }

  return (
    <div className="admin-conflict-list">
      {warnings.responsibleAdminConflicts.map((conflict) => (
        <p key={`admin-${conflict.sectionId}`}>
          <strong>Admin overlap:</strong> {conflict.responsibleAdminName} also has{" "}
          {conflict.courseCode} section {conflict.sectionNumber}.
        </p>
      ))}
      {warnings.locationConflicts.map((conflict) => (
        <p key={`location-${conflict.sectionId}`}>
          <strong>Room overlap:</strong> {conflict.location} is used by{" "}
          {conflict.courseCode} section {conflict.sectionNumber}.
        </p>
      ))}
      {[...studentGroups.values()].map(({ conflict, count: studentCount }) => (
        <p key={`student-${conflict.conflictingSectionId}`}>
          <strong>Student overlap:</strong> {studentCount} student
          {studentCount === 1 ? "" : "s"} conflict with {conflict.conflictingCourseCode}{" "}
          section {conflict.conflictingSectionNumber}.
        </p>
      ))}
    </div>
  );
}

function dayLabel(day: DayOfWeek) {
  return DAYS.find((candidate) => candidate.value === day)?.label ?? day;
}

function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
    minute % 60,
  ).padStart(2, "0")}`;
}

function formatCairoInput(date: Date | null) {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function transferPlanKey(
  transfers: Array<{ studentId: string; targetSectionId: string }>,
) {
  return JSON.stringify(
    [...transfers].sort((first, second) =>
      `${first.studentId}:${first.targetSectionId}`.localeCompare(
        `${second.studentId}:${second.targetSectionId}`,
      ),
    ),
  );
}
