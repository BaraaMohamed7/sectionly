# Sectionly — Agent Instructions

## 1. Project Goal

Sectionly is a lightweight university section-registration system.

It replaces separate Google Forms used for section booking with a centralized system that provides:

- student course selection,

- section registration,

- capacity enforcement,

- race-condition-safe seat allocation,

- schedule conflict detection,

- atomic section switching,

- course administration,

- registration/switching windows,

- announcements,

- audit logging,

- admin notifications,

- responsive student/admin interfaces.

This is NOT a full university academic registration system.

The current target is a working MVP that can be demonstrated and deployed quickly.

Do not introduce enterprise architecture or speculative abstractions unless they solve a current requirement.

---

# 2. Technology Stack

Use the existing project versions unless there is a concrete compatibility problem.

Expected stack:

- Next.js

- TypeScript

- PostgreSQL

- Prisma 7

- Tailwind CSS

- shadcn/ui

- Cairo font

- Vercel-compatible deployment

Do NOT:

- introduce NestJS or another backend service,

- introduce microservices,

- introduce Redis,

- introduce message queues,

- introduce event-driven infrastructure,

- change major dependency versions unnecessarily.

The Next.js application is the frontend and backend for the MVP.

---

# 3. Engineering Rules

Do not blindly implement requirements.

Before implementing a substantial feature:

1. inspect the relevant existing code,

2. identify affected business invariants,

3. identify database constraints,

4. identify authorization requirements,

5. identify concurrency concerns,

6. propose the implementation approach when the change is non-trivial.

Prefer the simplest architecture that correctly preserves the business rules.

Business logic must not live inside React UI components.

Critical mutations must be validated server-side.

Never trust:

- client-supplied role,

- client-supplied course ownership,

- client-supplied courseId relationships,

- client-side capacity checks,

- client-side schedule conflict checks,

- disabled buttons as authorization.

The frontend improves UX.

The server protects the system.

The database protects data integrity wherever practical.

---

# 4. Roles

Exactly three roles currently exist:

- STUDENT

- ADMIN

- SUPER_ADMIN

There may be multiple SUPER_ADMIN users.

SUPER_ADMIN is not tied to one specific person.

The system must never be left with zero SUPER_ADMIN users.

---

# 5. Authorization

STUDENT:

- requires an active STUDENT User linked to a Student record,

- requires completedCreditHours and isTransferredThisYear to be non-null for
  normal Student features,

- manages own course enrollments,

- registers own sections,

- switches own sections,

- views own schedule,

- views announcements for enrolled courses.

ADMIN:

- accesses only courses assigned through CourseAdmin,

- manages all sections within assigned courses,

- views enrolled students for assigned courses,

- manages announcements and registration settings for assigned courses.

Any ADMIN assigned to a course may manage all sections in that course.

Section owner/responsible admin is informational and useful for auditing; it does not exclusively control that section.

SUPER_ADMIN:

- has access to all courses,

- manages courses,

- manages admins,

- assigns admins to courses,

- may promote admins,

- accesses audit logs,

- has all ADMIN capabilities.

Authorization must be enforced server-side.

Changing a URL or request payload must never bypass authorization.

---

# 5.1 Identity Model

User is the authentication identity. Student is the academic identity.

Never assume User.id equals Student.id. Legacy migrated Students intentionally
retain their former User UUID, but all newly created records use distinct UUIDs.

Academic relationships use Student.id, including CourseEnrollment and
SectionRegistration. Audit actorId uses User.id. Student aggregate audit entity
IDs use Student.id.

Student.fullName and Student.universityId are required academic fields.
completedCreditHours and isTransferredThisYear may be null until profile
completion. Completeness is derived from those nullable fields. Do not add or
reintroduce an onboarding-completed flag.

ADMIN and SUPER_ADMIN names live in User.adminName without a "Dr." prefix.
Display the prefix as `Dr. {adminName}` in the UI. STUDENT Users must not have
adminName.

Public registration behavior:

- a new university ID creates a linked User and Student atomically,

- an existing unlinked Student creates a separate User and pending
  StudentLinkClaim,

- an existing linked Student receives a generic unavailable response that does
  not reveal account details.

Only an active, password-ready SUPER_ADMIN may approve or reject pending link
claims. Approval links Student.userId without moving or rewriting academic
records. Rejection preserves both records. Claim resolution must lock and
revalidate the actor User, requesting User, Student, and claim, then write the
audit row in the same transaction.

Student aggregate mutations must first authorize the User from an authoritative
database row, then lock the linked Student row as the per-student serialization
point. Lock multiple rows in deterministic UUID order.

---

# 6. Student Academic Level

Do NOT store academic level independently.

Derive it from completedCreditHours:

- 0–31: Level 1

- 32–65: Level 2

- 66–98: Level 3

- 99+: Level 4

There must be one shared implementation for this calculation rather than duplicating boundary logic throughout the application.

---

# 7. Course Selection

CourseEnrollment means:

"The student is taking this course in the current system."

It is NOT official university enrollment.

Students may select fewer than 12 credit hours.

Maximum selected credit hours:

19. 

The server must enforce this.

Students may add/remove courses later.

Initial course selection is a UI flow, not persisted account state. Course
management authorization must never depend on an onboarding-completed flag.

If removing a course with an existing SectionRegistration:

- clearly confirm the destructive consequence in the UI,

- delete the SectionRegistration,

- delete the CourseEnrollment,

- create the appropriate AuditLog,

- notify assigned course admins,

- perform the related database mutations atomically.

Course removal is allowed even if section registration has closed.

---

# 8. Sections

A section represents one weekly meeting.

Each section contains:

- course,

- responsible/owner admin,

- day of week,

- start time,

- end time,

- required normalized location,

- capacity,

- publication state.

Sections do NOT use fixed predefined time slots.

Store section times as minutes from midnight.

Examples:

08:00 = 480\
10:00 = 600\
11:00 = 660\
13:00 = 780\
20:00 = 1200

Valid university time range:

08:00 &lt;= startTime &lt; endTime &lt;= 20:00

All sections start and finish on the same day.

---

# 9. Schedule Conflict Rule

Two sections conflict when:

- they occur on the same day, AND

- newStart &lt; existingEnd, AND

- newEnd &gt; existingStart.

Examples:

10:00–12:00 and 11:00–13:00:\
CONFLICT.

10:00–12:00 and 12:00–14:00:\
NO CONFLICT.

Server-side validation is authoritative.

---

# 10. Section Publication

Publication and registration availability are separate concepts.

isPublished = false:

- students who are not registered there cannot discover/select the section.

isPublished = true:

- enrolled students may see it.

A published section may be visible before registration opens.

Registration actions remain disabled until the server-side registration window is open.

Unpublishing a section does NOT cancel existing registrations.

Existing students remain registered and can still see their current section.

Do not implement section cancellation as part of unpublish.

---

# 11. Registration Windows

Courses have separate:

- registrationOpensAt

- registrationClosesAt

- switchingOpensAt

- switchingClosesAt

They may also support:

- registrationPaused

- switchingPaused

Server time determines whether operations are allowed.

Frontend countdowns/statuses are informational only.

Do not use cron jobs simply to open or close registration.

Validate:

opensAt &lt; closesAt

when both values exist.

---

# 12. Registration Invariants

A student may have exactly one SectionRegistration per course.

The database must enforce uniqueness equivalent to:

UNIQUE(studentId, courseId)

Before registration succeeds, verify:

 1. authenticated user is the student performing the operation,

 2. CourseEnrollment exists,

 3. registration window is currently open,

 4. registration is not paused,

 5. target section exists,

 6. section belongs to the requested course,

 7. section is published,

 8. student has no existing registration for that course,

 9. section has available capacity,

10. section does not conflict with student's other registered sections.

Never trust courseId supplied by the client.

---

# 13. Section/Course Referential Integrity

SectionRegistration contains courseId intentionally.

This allows the database to enforce one section per student per course.

The system must also guarantee:

SectionRegistration.courseId == Section.courseId

Prefer database-level referential integrity using a composite relationship where supported cleanly:

Section:\
UNIQUE(id, courseId)

SectionRegistration:\
(sectionId, courseId) references Section(id, courseId)

Do not rely only on client input for this invariant.

---

# 14. Concurrency — Critical Requirement

Section capacity must be race-condition safe.

Example:

capacity = 30\
registered = 29

Twenty simultaneous requests must never result in more than 30 registrations.

A naive:

count registrations\
if count &lt; capacity\
insert

implementation is forbidden.

Wrapping the naive logic in a transaction without an appropriate concurrency strategy is not automatically sufficient.

For registration, use a PostgreSQL transaction and an appropriate row-level locking/atomic strategy.

Expected conceptual flow:

BEGIN

lock target Section row

revalidate all critical conditions

count current registrations

verify capacity

verify schedule conflict

insert registration

create audit record

COMMIT

Competing requests for the same section must serialize appropriately.

Requests for unrelated sections should not unnecessarily block each other.

Concurrency correctness must be tested.

---

# 15. Switching Sections

Switching must be atomic.

Never:

1. release old seat,

2. attempt new registration.

The student's current seat must remain theirs unless the switch succeeds.

Conceptual transaction:

BEGIN

load current registration

lock required section resources using deterministic ordering

validate switching window

validate target section

validate target capacity

validate schedule conflicts, excluding current section

update existing SectionRegistration from old section to target section

create SECTION_SWITCHED audit entry

COMMIT

If any step fails:

ROLLBACK.

The student remains in the original section.

When locking multiple section rows, use deterministic lock ordering to reduce deadlock risk.

Handle database transaction failures safely.

---

# 16. Capacity Changes

Capacity must be greater than zero.

After section creation, capacity may increase but must never decrease, even if
the requested value remains above the current registration count.

Enforce this rule server-side. A disabled input or HTML minimum is not enough.

---

# 17. Admin Section Management

ADMIN may manage sections only for courses assigned through CourseAdmin.

SUPER_ADMIN may manage sections in any course.

The responsible Admin selected for a section must have a CourseAdmin assignment
for that course, including when the responsible user is a SUPER_ADMIN.

New sections start unpublished. Publication is a separate mutation.

Creating or editing a section must preview:

- overlapping sections for the responsible Admin,

- overlapping sections using the same normalized, case-insensitive location,

- schedule conflicts created for currently registered students when time changes.

These are warning-only conflicts. Confirmation may override them, but the server
must recompute them inside the confirmed mutation.

Section edits use optimistic concurrency. Compare the submitted updatedAt with
the locked current row and reject stale edits atomically.

---

# 18. Section Deletion and Transfers

Deleting a populated section requires an explicit destructive confirmation.

The preview must return a deterministic server-verifiable token that binds the
exact transfers, removals, target occupancy/capacity totals, and schedule
warnings shown to the Admin. A generic confirmation boolean is insufficient.

The Admin may transfer any subset of source registrations to other sections in
the same course. Registrations left in the source section are deleted.
CourseEnrollment rows are preserved.

The complete operation must be atomic:

1. authorize and lock the course,

2. lock source and target Section rows in deterministic UUID order,

3. lock affected registrations,

4. revalidate source membership, target course, capacity, and schedule conflicts,

5. compare the freshly recomputed deletion state with the reviewed-state token,

6. transfer selected registrations,

7. remove remaining source registrations,

8. delete the source section,

9. write transfer/deletion AuditLog entries,

10. commit.

Target capacity is a hard failure and cannot be overridden. Schedule conflicts
are warning-only and may be explicitly confirmed. If the locked recomputation
differs from the reviewed state, roll back without writes and return a fresh
preview for another explicit confirmation.

---

# 19. Window Pause Semantics

Registration and switching windows are independent.

Pausing records the database/server time in the corresponding pausedAt field.
Editing dates while paused preserves that original timestamp.

Normal resume clears paused state and preserves closesAt.

Resume plus extend clears paused state and adds the actual elapsed pause duration
to closesAt, using database/server time.

All successful window edits, pauses, and resumes must be audited. Failed
mutations must not leave audit rows.
