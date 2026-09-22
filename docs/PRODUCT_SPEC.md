# Sectionly — Product Specification

## 1. Product Overview

Sectionly is a lightweight university section-registration platform.

The initial use case is university students selecting their current courses and reserving available weekly sections without relying on separate Google Forms.

The product focuses on:

- simple student onboarding,

- course selection,

- section discovery,

- fair and safe seat allocation,

- schedule conflict prevention,

- easy section switching,

- operational tools for teaching assistants/admins,

- clear registration schedules,

- mobile-friendly usage.

Sectionly is NOT intended to replace the university's official academic registration system.

Course selection inside Sectionly means only that the student is taking that course and wants to use Sectionly for its sections.

---

# 2. Product Roles

Sectionly has three roles.

## 2.1 Student

A Student can:

- create an account,

- enter university information,

- select current courses,

- add/remove courses later,

- see registration opening/closing times,

- view published sections,

- register in one section per course,

- switch sections when switching is allowed,

- view their weekly schedule,

- view course announcements,

- manage their profile.

`User` is the authentication account and `Student` is the academic record. They
have independent IDs. Course enrollments, section registrations, names,
university IDs, and academic profile fields belong to `Student`; login email,
password, locale, role, and active state belong to `User`.

## 2.2 Admin

An Admin represents a teaching assistant/course administrator.

An Admin can:

- access assigned courses,

- view course operational status,

- create and manage sections,

- publish/unpublish sections,

- adjust capacity,

- change section times,

- view enrolled students,

- identify students without a section,

- create course announcements,

- configure registration and switching windows,

- pause registration/switching,

- receive relevant admin notifications.

An Admin assigned to a course may manage all sections within that course.

Sections still have a responsible/owner admin for informational and audit purposes.

## 2.3 Super Admin

There may be multiple Super Admins.

A Super Admin can:

- perform all Admin operations,

- access all courses,

- create/manage courses,

- create/manage Admin accounts,

- assign Admins to courses,

- choose a primary Admin for a course,

- promote eligible users to Super Admin,

- view system audit logs.

- approve or reject pending Student account-link claims.

The system must never be left with zero Super Admins.

---

# 3. Student Registration

Student registration collects:

- full name,

- university ID,

- email,

- password,

- completed credit hours,

- whether the student transferred from another college/university this year.

Email is unique across User accounts. University ID is unique across Student
records.

Email must be valid, but a university-domain email is not required.

No email OTP or university verification is required for the MVP.

For a new university ID, account creation atomically creates a linked User and
Student with distinct IDs. The Student can authenticate and continue to course
selection.

If the university ID belongs to an existing unlinked Student record, account
creation creates a separate User and a pending StudentLinkClaim. Student
features remain blocked until a Super Admin approves the link. The claim retains
the submitted name, completed hours, and transfer status as unverified proposed
data, but registration must not overwrite the existing academic record.

On approval, the existing Student name remains authoritative. Proposed
completed hours and transfer status fill only corresponding null Student fields;
non-null Student values are never replaced automatically. Rejection applies no
proposed values and retains the resolved claim as history.

If the existing Student is already linked, registration returns a generic
unavailable response without disclosing account ownership.

The MVP does not implement application-level rate limiting. Login and registration must receive platform-level rate limiting before unrestricted public deployment.

---

# 4. Academic Level

Academic level is calculated from completed credit hours.

Do not ask the student to independently choose their level.

Rules:

| Completed Hours | Level |
| --- | --- |
| 0–31 | Level 1 |
| 32–65 | Level 2 |
| 66–98 | Level 3 |
| 99+ | Level 4 |

The calculated level is displayed throughout the product where useful.

---

# 5. Student Entry Flow

Expected flow:

Create Account\
→ Complete Missing Profile Fields, if any\
→ Select Courses\
→ Confirm Courses\
→ Dashboard

An account awaiting a Student link stays on a review-status screen until a
Super Admin resolves the claim.

Course selection is a UI flow rather than persisted account state. The system
does not store an onboarding-completed flag, and Students may manage courses
later regardless of whether they used the initial selection screen.

---

# 6. Course Selection

Students select the courses they are currently taking.

Each course contains:

- Arabic name,

- English name,

- unique course code,

- credit hours.

The total selected credit hours must not exceed:

19 credit hours.

Students may select fewer than 12 hours.

There is no minimum credit-hour requirement.

Students should be able to browse/search other available courses during onboarding and later from Manage Courses.

---

# 7. Manage Courses

Students may add and remove courses after onboarding.

## Adding

Before adding a course:

- calculate the new total credit hours,

- reject the operation if the result exceeds 19.

Example:

Current = 16 CH\
New course = 4 CH

Result = 20 CH

The Add action must be unavailable/rejected.

## Removing

A student may remove a course at any time.

This remains allowed even after section registration closes.

If no section has been selected:

show a normal confirmation.

If the student has an active section registration:

show a stronger confirmation explaining that removing the course will also cancel their section registration.

After confirmation:

- remove section registration,

- remove course enrollment,

- notify assigned course Admins,

- record the action.

These related changes must behave atomically.

---

# 8. Courses

A course supports:

- student enrollments,

- assigned Admins,

- zero or one primary Admin,

- sections,

- announcements,

- registration window,

- switching window,

- pause controls.

The MVP represents the current operational set of courses.

Course credit hours are treated operationally as static institutional data. The MVP does not add enrollment-based editing restrictions or credit-hour history/versioning.

Semester/history modeling is intentionally deferred to a future version.

---

# 9. Course Admin Assignment

A course may have multiple assigned Admins.

Zero or one assigned Admin may be marked as primary.

All assigned Admins can manage the course.

The primary designation is informational/organizational and does not prevent other assigned Admins from managing sections.

---

# 10. Sections

A Section represents one weekly meeting.

A section has:

- course,

- positive integer section number that is unique within its course,

- responsible Admin/instructor,

- day,

- start time,

- end time,

- required normalized location,

- capacity,

- publication state.

Sections use arbitrary start/end times rather than fixed predefined slots.

Valid section times are between:

08:00 and 20:00.

A section starts and ends on the same day.

Valid section days are Saturday through Thursday. Friday is not valid.

Example valid sections:

08:00–10:00\
10:00–12:00\
11:00–13:00\
14:00–16:00

---

# 11. Section Visibility

Admins control whether a section is published.

## Unpublished

Students who are not already registered there do not discover/select it.

## Published

Students enrolled in the course may see it.

A section may be published before registration opens.

In that case:

- students can inspect the section,

- registration action is disabled,

- registration opening time is displayed.

Unpublishing a section does NOT cancel existing registrations.

Students already registered there remain registered.

---

# 12. Registration Schedule

Each course may define:

- registration opening time,

- registration closing time,

- switching opening time,

- switching closing time.

Each opening and closing pair must either both be configured or both be null. A null/null window is closed, and a partially configured window is invalid.

Opening is inclusive and closing is exclusive:

opensAt &lt;= now &lt; closesAt

Institutional scheduling and date rendering use the Africa/Cairo timezone.

Registration and switching are separate windows.

Example:

Registration:\
Sep 20 20:00 → Sep 23 20:00

Switching:\
Sep 20 20:00 → Sep 27 20:00

The product automatically determines availability based on server time.

Admins may also temporarily pause registration or switching.

Pausing records the server/database time. Editing a paused window preserves the
original pause start. Normal resume keeps the configured closing time. Resume
and extend adds the actual paused duration to the closing time. Registration
and switching remain independent throughout these operations.

---

# 13. Student Course Status

A course on the Student Dashboard may appear in states such as:

## Registered

Student has a section.

Display:

- section,

- day/time,

- responsible instructor/Admin.

## Registration Open — Action Required

Registration is open but the student has not selected a section.

Display a clear Choose Section action.

## Upcoming

Registration has not opened.

Display opening date/time and optionally a countdown.

## Closed — No Section

Registration closed and the student did not select a section.

## Schedule Conflict

An Admin changed an existing section time and the student's schedule now contains an overlap.

Display a warning.

---

# 14. Section Registration

A Student may register in exactly one section per course.

Registration is allowed only when:

- the Student is enrolled in the course,

- registration window is open,

- registration is not paused,

- section is published,

- section belongs to the course,

- student does not already have a section for the course,

- capacity remains,

- the section does not conflict with another registered section.

All rules are enforced server-side.

---

# 15. Capacity

Each section has a maximum capacity.

Example:

Section 1\
28 / 30

Two seats remain.

If capacity reaches:

30 / 30

the section is Full.

The system must never allow registrations beyond capacity, including under simultaneous requests.

After a section is created, capacity may increase but may never decrease. This
rule is intentionally stricter than comparing capacity with current
registrations and prevents ambiguous seat-policy changes.

---

# 16. Registration Confirmation

Selecting Register does not immediately submit the final registration.

Show a confirmation dialog containing:

- course,

- section,

- day/time,

- responsible instructor/Admin.

Actions:

- Cancel

- Confirm

During the server request:

- disable repeated submission,

- show a loading state.

Success must only appear after server confirmation.

---

# 17. Last-Seat Scenario

Displayed capacity may become stale.

Example:

Student sees:

29 / 30

The confirmation dialog is open.

Another student acquires the final seat first.

When the first student confirms afterward, the server rejects the request.

Show a clear message similar to:

"Section just filled up. Another student completed registration before your request."

Refresh the relevant section capacity.

Do not display a false success state.

---

# 18. Schedule Conflicts

Students cannot register for overlapping sections.

Conflict condition:

same day

AND

newStart &lt; existingEnd

AND

newEnd &gt; existingStart

Example:

Distributed Systems:\
Sunday 10:00–12:00

Software Testing:\
Sunday 11:00–13:00

Result:\
Conflict.

But:

10:00–12:00\
12:00–14:00

is allowed.

When a section conflicts, disable registration and explain which existing course/section causes the conflict.

---

# 19. Switching Sections

If a Student already has a section for a course, other available sections show:

Switch Here

instead of:

Register.

Selecting Switch shows confirmation containing:

FROM:\
current section

TO:\
target section

The UI must explain:

the current section remains reserved unless the switch succeeds.

---

# 20. Atomic Switching

Switching must either:

- succeed completely,

or:

- leave the Student exactly where they were.

Failure examples:

- target became full,

- target conflicts,

- switching closed,

- switching paused,

- database transaction failed.

In every failure case:

the Student remains registered in their original section.

Never release the old seat before guaranteeing the switch transaction.

---

# 21. Student Schedule

Students have a Schedule screen.

Mobile default:

group registrations by day in a readable list/card layout.

Example:

Saturday

08:00–10:00\
Distributed Systems\
Section 1

12:00–14:00\
Software Testing\
Section 3

Desktop may enhance this into a weekly grid.

The mobile list remains a first-class experience.

---

# 22. Post-Registration Schedule Conflict

Normally, registration prevents conflicts.

However, an Admin may later change a section's time.

This can create a conflict between existing registrations.

In this case:

- do not automatically move the Student,

- keep registrations intact,

- show a visible warning on Dashboard/Schedule,

- explain the conflicting sections.

---

# 23. Student Dashboard

The Dashboard should quickly answer:

1. What courses am I taking?

2. Which sections am I registered in?

3. Do I need to register for anything?

4. When is the next important registration event?

5. Are there schedule problems?

6. Are there recent announcements?

Content includes:

- greeting,

- derived academic level,

- completed hours,

- nearest relevant registration/switching event,

- current credit-hour total,

- course cards,

- recent announcements.

Courses requiring action should be visually prioritized.

---

# 24. Upcoming Event

Do not show one meaningless global countdown.

Courses may have different registration schedules.

Show the nearest useful event, for example:

- registration opens,

- registration closes soon,

- switching closes soon.

If no meaningful upcoming event exists, the card may be omitted.

---

# 25. Announcements

Admins can create announcements for assigned courses.

Announcement contains:

- title,

- content,

- author,

- creation time.

Every Student enrolled in that course can view the announcement.

Section registration is NOT required to receive/view it.

MVP announcements are in-app only.

---

# 26. Student Profile

Profile displays:

- full name,

- university ID,

- email,

- derived academic level,

- completed credit hours,

- transferred-this-year status,

- language,

- account actions.

The student may update completed credit hours.

Academic level updates automatically.

Important profile changes should be audited where appropriate.

---

# 27. Admin Dashboard

The Admin Dashboard is operational rather than analytics-heavy.

Show:

- assigned courses,

- students enrolled,

- students registered in sections,

- students without sections,

- number of sections,

- registration state,

- registration closing/opening information,

- important notifications.

Avoid decorative charts that do not help an Admin take action.

---

# 28. Needs Attention

The Admin Dashboard may highlight actionable situations.

Example:

"12 students haven't selected a section in Distributed Systems."

Provide direct navigation to the relevant students list.

---

# 29. Admin Notifications

Admins have individual read/unread notifications.

Initial important notification:

A Student removed a course after previously holding a section seat.

Example:

"Baraa Mohamed removed Distributed Systems and released their seat in Section 2."

Each assigned Admin receives their own notification.

Recipients are the Admins assigned to the course when the Student removes it. Each recipient receives a separate notification so read/unread state remains independent.

---

# 30. Admin Course Page

Course management contains:

- Overview

- Sections

- Students

- Announcements

- Settings

Mobile uses horizontally scrollable tabs or an equivalent touch-friendly navigation.

---

# 31. Course Overview

Display:

Registration:

- state,

- opening time,

- closing time.

Switching:

- state,

- opening time,

- closing time.

Students:

- enrolled,

- registered,

- not registered.

Sections:

- count,

- capacity usage where useful.

Quick actions:

- Add Section

- Create Announcement

- Registration Settings

Recent meaningful activity may be shown from AuditLog.

---

# 32. Sections Management

Admins can:

- create section,

- edit section,

- increase capacity,

- publish,

- unpublish,

- delete with an explicit registration transfer/removal plan.

Desktop may use a table.

Mobile uses cards.

Each section displays:

- section identity,

- day/time,

- responsible Admin,

- registered/capacity,

- availability,

- publication state,

- actions.

---

# 33. Create Section

Fields:

- responsible Admin,

- day,

- start time,

- end time,

- location,

- capacity,

New sections always start unpublished. Publication is a separate action.

Responsible Admin must be assigned to the course.

Time must remain inside:

08:00–20:00.

Capacity must be positive.

---

# 34. Edit Capacity

Example:

Current registrations:\
28

Current capacity:\
30

Admin attempts:\
29

Reject.

Capacity cannot be decreased after section creation, even when the requested
value remains above the current registration count.

Admin changes:\
30 → 35

Accept.

Five new seats become immediately available.

---

# 35. Section Deletion

Use Unpublish when the goal is only to prevent new students from selecting a
section. Unpublishing keeps existing registrations.

Admins may explicitly delete an empty or populated section. Before confirmation,
the UI must show a destructive preview. For a populated section, the Admin may
group selected students into other sections in the same course. Registrations
left in the source section are removed, but CourseEnrollment records are always
preserved.

The server issues an opaque reviewed-state token for the exact transfers,
removals, target totals, and schedule warnings in that preview. Changing a
selection invalidates the preview. Final confirmation recomputes the state after
locking; any difference returns a fresh preview and performs no writes.

The server must lock source and target sections in deterministic ID order,
revalidate target capacity and student schedule conflicts, transfer selected
registrations, remove remaining registrations, delete the section, and write
audit records in one transaction. Any failure rolls back the complete operation.

---

# 36. Edit Section Time — Conflict Preview

If an Admin changes a section day/time, existing Students may develop conflicts.

Before final save, calculate impact.

Creation and editing also preview operational overlaps across courses:

- the responsible Admin has another overlapping section,

- the normalized location is used by another overlapping section.

These and existing-student schedule conflicts are explicit warnings that an
Admin may override. The server recomputes warnings in the confirmed mutation;
the preview is never trusted as authorization or validation.

Example:

"Changing this section creates schedule conflicts for 7 students."

Group useful conflict information:

Software Testing\
Sunday 12:00–14:00\
5 affected students\
Responsible: Mohamed Ali

Database Systems\
Sunday 13:00–15:00\
2 affected students\
Responsible: Sara Ahmed

Actions:

- Cancel

- Change Anyway

If Admin confirms:

- save the new time,

- keep students registered,

- do not automatically modify other sections,

- record the change.

Students then see conflict warnings.

Alternative-time recommendations are deferred.

---

# 37. Students Management

Admins can view Students enrolled in the course.

Filters:

- All

- Registered

- Not Registered

Search:

- full name,

- university ID.

Display useful information:

- full name,

- university ID,

- email,

- academic level,

- completed hours,

- transferred status,

- current section if any.

Admin manual section assignment is NOT required for MVP.

---

# 38. Not Registered Definition

A Student is "Not Registered" for a course when:

CourseEnrollment exists

AND

no SectionRegistration exists for that Student/course.

This report does not depend on an external university roster.

---

# 39. Course Settings

Admins can configure:

Registration:

- opens,

- closes,

- paused/unpaused.

Switching:

- opens,

- closes,

- paused/unpaused.

Changing settings should be audited.

Server-side time is authoritative.

Window edits, pause, normal resume, and resume-with-extension are separate
audited operations. Pausing an unconfigured window is invalid.

---

# 40. Super Admin — Courses

Super Admins can:

- create courses,

- edit courses,

- set course code,

- set credit hours,

- assign Admins,

- choose primary Admin.

The primary Admin is optional. A course may have zero or one primary Admin.

Course code must be unique.

---

# 41. Super Admin — Admins

Super Admins can:

- create Admin accounts,

- view Admins,

- manage course assignments,

- promote ADMIN to SUPER_ADMIN where allowed.

Initial Admin creation may use:

- name displayed after the `Dr.` prefix,

- email,

- temporary password.

New Admins must change their temporary password on first login.

Admin accounts are deactivated through an `isActive` state rather than hard-deleted. Inactive Admins cannot authenticate or manage the system, and historical references remain intact.

Advanced invitation/email flows are deferred.

The Admin name is stored without `Dr.` and displayed as `Dr. {adminName}`.

The Admins area also lists pending StudentLinkClaims. Only active,
password-ready Super Admins may approve or reject them. Approval links the User
to the existing Student without moving academic rows. Rejection keeps both the
User and Student records and preserves claim history.

The system must protect against removing the final Super Admin.

---

# 42. Super Admin — Audit Log

Super Admin can inspect system audit history.

Useful filters:

- actor,

- action,

- course/entity,

- date.

Audit Log is operational/history tooling.

It is not an analytics dashboard.

---

# 43. Localization

MVP supports:

- Arabic,

- English.

Arabic:

RTL.

English:

LTR.

Use Cairo typography in both languages.

Avoid layouts that only work correctly in LTR.

---

# 44. Responsive Requirements

Student, Admin, and Super Admin workflows must all work on mobile.

No critical operation requires desktop.

Mobile:

- cards instead of compressed tables,

- touch-friendly controls,

- stacked forms,

- suitable dialogs/drawers,

- scrollable tabs where necessary,

- no horizontal page scrolling.

Desktop:

- wider content,

- tables where appropriate,

- richer navigation,

- optional weekly schedule grid.

---

# 45. Main Application Routes

Public:

/login\
/register

Authenticated onboarding:

/complete-profile\
/student-link-status\
/register/courses\
/register/confirm

Student:

/dashboard\
/courses\
/courses/\[courseId\]\
/schedule\
/profile

Admin/Super Admin:

/admin\
/admin/courses/\[courseId\]

Course page includes:

Overview\
Sections\
Students\
Announcements\
Settings

Super Admin additional areas:

/admin/courses\
/admin/admins\
/admin/audit

Exact internal folder organization may differ if the framework architecture benefits from route groups/layouts.

User-facing URLs should remain simple.

---

# 46. Important Product Invariants

The implementation must preserve:

 1. No Student exceeds 19 selected credit hours.

 2. One Student has at most one section per course.

 3. Section registration course matches the Section's course.

 4. Section capacity is never exceeded.

 5. Normal Student registration never creates a schedule conflict.

 6. Switching never loses the Student's existing seat on failure.

 7. Admin cannot manage an unassigned course unless Super Admin.

 8. Section capacity cannot be decreased after creation.

 9. Registration/switching obey server-side windows.

10. Unpublishing does not remove existing registrations.

11. Course removal also removes existing section registration atomically.

12. System always retains at least one Super Admin.

13. Section deletion transfers/removals and audit writes are atomic.

14. Confirmed conflict overrides recompute current conflicts on the server.

15. Concurrent section edits use the expected updatedAt value and reject stale writers.

16. User IDs and Student IDs are distinct and never substituted for one another.

17. Academic relationships remain attached to Student when an account link is approved.

18. At most one pending link claim exists per Student and per requesting User.

---

# 47. MVP Priority

## P0 — Must Work

- authentication,

- RBAC,

- student registration/onboarding,

- course selection,

- 19 CH enforcement,

- Admin/course assignment,

- section creation/editing,

- publish/unpublish,

- registration windows,

- concurrency-safe section registration,

- schedule conflict prevention,

- atomic switching,

- student dashboard,

- admin course dashboard,

- registered/not-registered student views.

## P1 — Important

- announcements,

- admin notifications,

- student schedule,

- audit log UI,

- Admin section-time conflict preview,

- Arabic/English localization.

## P2 — Defer if Necessary

- CSV export,

- automatic alternative-time suggestions,

- advanced account invitation flow,

- advanced analytics,

- extensive visual polish,

- semester/history model,

- section cancellation workflow.

---

# 48. MVP Success Scenarios

The demo should prove at least these scenarios:

### Student onboarding

Student creates account, enters academic information, selects &lt;=19 CH, confirms, reaches Dashboard.

### Existing Student account link

An account created for an existing unlinked Student remains blocked until a
Super Admin approves its claim; approval exposes the existing academic records
without changing their Student ID.

### Course registration

Student opens an enrolled course and sees published sections.

### Successful registration

Student registers in an available non-conflicting section.

### Capacity protection

Final seat cannot be allocated to more than one Student under concurrency.

### Conflict prevention

Student cannot select overlapping sections.

### Switching

Student switches to another available section without temporarily losing the old seat.

### Failed switching

Target fills before switch completes; Student remains in original section.

### Admin management

Admin creates/publishes sections and adjusts capacity.

### Missing students

Admin sees enrolled Students who have not selected sections.

### Registration scheduling

Course automatically appears open/closed based on configured server-side times.

### Course removal

Student removes a course with a section; registration is released, course enrollment removed, Admins notified.

---

# 49. Product Philosophy

Sectionly should feel:

fast,\
clear,\
safe,\
simple.

A Student should not need technical knowledge to understand why an action is unavailable.

An Admin should be able to operate the course from a phone.

Critical business rules should be enforced even if the frontend is bypassed.

The MVP should solve the real registration problem before adding secondary features.
