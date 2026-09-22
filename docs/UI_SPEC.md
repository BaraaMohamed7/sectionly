# Sectionly — UI Specification

## 1. UI Goal

Sectionly should feel like a modern, lightweight academic product.

The interface should be:

- clean,

- calm,

- fast,

- mobile-first,

- easy to scan,

- operational rather than decorative,

- consistent between Student, Admin, and Super Admin.

Avoid the appearance of a generic AI-generated dashboard.

The UI should help users immediately understand:

- current state,

- available actions,

- blocked actions,

- why an action is blocked,

- what requires attention.

---

# 2. Design Direction

Primary visual direction:

- white background,

- light blue supporting surfaces,

- clear blue primary actions,

- dark readable text,

- subtle borders,

- restrained shadows,

- generous whitespace,

- rounded cards,

- clear status indicators.

Do NOT use:

- purple as a primary color,

- indigo-heavy identity,

- purple/blue gradients,

- glassmorphism,

- large dark/navy dashboard backgrounds,

- excessive shadows,

- neon effects,

- decorative charts without operational value,

- overly dense enterprise dashboard layouts.

The interface should look credible for a university product while still feeling modern.

---

# 3. Color Tokens

Use semantic design tokens rather than hardcoding colors throughout components.

Suggested starting palette:

Background:\
#FFFFFF

Soft Background:\
#F6FAFF

Light Blue Surface:\
#EAF4FF

Primary:\
#2563EB

Primary Hover:\
#1D4ED8

Primary Soft:\
#DBEAFE

Main Text:\
#172033

Secondary Text:\
#475569

Muted Text:\
#64748B

Border:\
#E2E8F0

Success:\
use accessible green semantic tokens.

Warning:\
use accessible amber semantic tokens.

Danger:\
use accessible red semantic tokens.

Info:\
use blue semantic tokens.

Exact semantic shades may use the project's Tailwind/shadcn token system.

Do not introduce a competing purple/indigo palette.

---

# 4. Typography

Use Cairo throughout the application for both Arabic and English.

The typography should remain readable rather than oversized.

Suggested hierarchy:

Page Title:\
24–28px\
700 weight

Section Title:\
18–20px\
600–700 weight

Card Title:\
16px\
600 weight

Body:\
14–16px\
400 weight

Metadata:\
12–14px\
400–500 weight

Button:\
14px\
600 weight

Important numbers may use slightly stronger weight.

Avoid giant marketing-style headings inside the application.

---

# 5. Direction and Localization

English:\
LTR

Arabic:\
RTL

Changing language must change layout direction appropriately.

Do not simply translate strings while leaving the Arabic layout visually LTR.

Directional icons must behave correctly.

Examples:

- back arrow direction,

- chevrons,

- form alignment,

- card action alignment,

- navigation placement where appropriate.

Avoid manually using left/right spacing when logical start/end properties can be used.

---

# 6. Spacing

Use a consistent spacing scale.

Typical:

4px\
8px\
12px\
16px\
20px\
24px\
32px

Mobile page horizontal padding:

approximately 16px.

Larger mobile/tablet:

20–24px where appropriate.

Desktop content should not stretch indefinitely.

Student content maximum width should generally remain around:

1100–1200px.

Forms should use narrower readable widths where appropriate.

---

# 7. Cards

Default card:

- white background,

- subtle border,

- 12–16px radius,

- 16–20px padding,

- minimal or very subtle shadow.

Cards should group meaningful information.

Do not wrap every small text element in another card.

Status-heavy cards may use a subtle semantic background/border treatment.

---

# 8. Buttons

Primary:

- solid blue,

- white text,

- clear hover/pressed state.

Secondary:

- white or subtle surface,

- border,

- readable text.

Danger:

- red semantic styling,

- reserved for destructive operations.

Ghost:

- for low-emphasis secondary actions.

Disabled buttons must look clearly disabled.

Do not rely only on opacity if the result becomes hard to understand.

Critical touch targets should be comfortable on mobile.

Aim for approximately 44px minimum interactive height where practical.

---

# 9. Form Controls

Labels appear clearly above fields.

Validation errors appear near the relevant field.

Inputs should be comfortable on mobile.

Use suitable controls for:

- select,

- date/time,

- numeric capacity,

- password,

- search.

Do not use placeholder text as the only label.

Time controls for sections must respect:

08:00–20:00.

---

# 10. Status Presentation

Statuses should use:

- concise label,

- semantic color,

- optional small icon.

Examples:

Registered\
Available\
Full\
Registration Open\
Registration Closed\
Upcoming\
Time Conflict\
Published\
Unpublished\
Paused

Do not communicate status through color alone.

Always include text.

---

# 11. Feedback

Use inline feedback when it helps the user understand the affected component.

Use toast notifications for lightweight global confirmation.

Use dialogs/drawers for actions requiring explicit confirmation.

Examples:

Registration succeeded:\
toast + updated card state.

Section filled:\
inline/error state + refresh relevant data.

Course removal:\
confirmation dialog.

Section time conflict preview:\
dialog or responsive sheet.

---

# 12. Loading States

Do not leave users wondering whether an action worked.

For mutation buttons:

disable during request.

Examples:

Register\
→ Registering...

Switch\
→ Switching...

Save\
→ Saving...

Create Section\
→ Creating...

For page/data loading:

use restrained skeletons where useful.

Avoid excessive animated loading UI.

---

# 13. Empty States

Every important list should have an intentional empty state.

Examples:

No courses:\
"You haven't selected any courses yet."\
\[ Add Course \]

No announcements:\
"No announcements yet."

No notifications:\
"You're all caught up."

No sections:\
"No sections have been published yet."

No students missing sections:\
"All enrolled students have selected a section."

Empty states should be useful and concise.

---

# 14. Error States

Errors should explain what happened in user language.

Avoid exposing raw database or framework errors.

Examples:

Bad:\
"Unique constraint P2002"

Good:\
"You already have a section for this course."

Bad:\
"Transaction failed"

Good:\
"We couldn't complete the switch. Your current section is still reserved."

---

# 14.1 Student Identity Entry States

After authentication, route a STUDENT account according to authoritative data:

- no linked Student: `/student-link-status`,
- linked Student with missing completed hours or transfer status:
  `/complete-profile`,
- linked and complete Student: normal Student routes.

The link-status screen explains that a Super Admin must review the account. It
must not reveal whether another account owns the university ID or expose
private account details. Keep logout available.

The complete-profile screen collects only the missing academic information:
completed credit hours and transfer status. Profile completeness is derived
from those values; do not show or persist an onboarding-completed state.

Initial course selection may follow profile completion, but it is a navigation
flow rather than an account gate. A Student may select zero courses and manage
courses later.

---

# 15. Global Student Navigation

Mobile:

bottom navigation.

Primary items:

Home\
Courses\
Schedule\
Profile

Use icon + text.

Clearly indicate active destination.

Desktop/tablet may use a top navigation or wider equivalent while maintaining the same information architecture.

---

# 16. Student Dashboard

Route:

/dashboard

Mobile-first layout.

Order:

1. Header

2. Important alert/conflict if present

3. Nearest upcoming registration event if useful

4. My Courses header + credit-hour total

5. Course cards

6. Recent announcements

7. Bottom navigation

Header example:

Good evening, Baraa

Level 3 · 72 completed hours

Include language control in a non-intrusive position.

---

# 17. Dashboard Alerts

Critical actionable information appears near the top.

Example:

Schedule Conflict

Distributed Systems and Software Testing now overlap on Sunday.

\[ View Schedule \]

Use warning styling.

Do not hide critical problems below unrelated content.

---

# 18. Upcoming Registration Card

Show only when useful.

Example:

Distributed Systems

Registration opens in

1d 04h 23m

Sep 20 · 8:00 PM

Possible events:

- registration opens,

- registration closes soon,

- switching closes soon.

Do not display an irrelevant global countdown.

If no important event exists, omit this card.

---

# 19. Dashboard Course Summary

Header:

My Courses

12 / 19 CH

Action:

Manage Courses

Courses requiring Student action should appear before normal registered courses.

---

# 20. Student Course Card — Registered

Example:

Distributed Systems\
3 CH

Registered

Section 2\
Sunday · 10:00–12:00\
Ahmed Mohamed

\[ View \]

Use success status without making the whole card aggressively green.

---

# 21. Student Course Card — Registration Open

Example:

Software Testing\
3 CH

Registration Open

You haven't selected a section yet.

\[ Choose Section \]

This state should visually attract more attention than already completed courses.

---

# 22. Student Course Card — Upcoming

Example:

Database Systems\
3 CH

Upcoming

Registration opens\
Sep 21 · 8:00 PM

\[ View Sections \]

Published sections may be viewed even before registration opens.

---

# 23. Student Course Card — Closed

Example:

Software Testing

Registration Closed

No section selected.

Do not show a misleading active registration action.

---

# 24. Course Sections Screen

Route:

/courses/\[courseId\]

Header:

back navigation

Course name\
Course code · credit hours

Registration status.

Example:

Registration Open\
Closes Sep 23 · 8:00 PM

If Student already has a section, display a compact "Your Section" summary before the list.

---

# 25. Section Card — Available

Example:

Section 1

Available

Saturday · 08:00–10:00\
Ahmed Mohamed

24 / 30 students\
6 seats left

\[ Register \]

Capacity should be easy to scan.

A small progress indicator may be used if subtle and useful.

Do not make it visually dominant.

---

# 26. Section Card — Full

Example:

Section 3

Full

Monday · 10:00–12:00\
Mohamed Ali

30 / 30 students\
No seats available

\[ Full \]

Button disabled.

---

# 27. Section Card — Conflict

Example:

Section 4

Time Conflict

Sunday · 11:00–13:00

Conflicts with:\
Software Testing\
Sunday · 12:00–14:00

\[ Can't Register \]

Explain the reason directly on the card or in an immediately accessible detail.

---

# 28. Section Card — Current Registration

Example:

Section 2

Your Section

Sunday · 10:00–12:00\
Ahmed Mohamed

\[ Registered \]

Clearly distinguish it from alternatives.

---

# 29. Section Card — Switching

When Student already has another section:

Available alternatives use:

\[ Switch Here \]

instead of:

\[ Register \]

Do not make the Student manually unregister first.

---

# 30. Section Card — Registration Not Open

Published section remains visible.

Example:

Registration opens in\
02:14:32

\[ Registration Not Open \]

disabled.

Opening time should remain visible even if countdown is omitted.

---

# 31. Registration Confirmation

Use a responsive Dialog on desktop and a suitable Dialog/Sheet presentation on mobile.

Title:

Confirm Registration

Content:

Distributed Systems\
Section 1\
Saturday · 08:00–10:00\
Ahmed Mohamed

Actions:

Cancel\
Confirm

Do not overload the dialog with unnecessary text.

---

# 32. Registration In Progress

After Confirm:

disable controls.

Primary action:

Registering...

Prevent accidental repeated submissions.

Do not show success until the server confirms.

---

# 33. Section Filled Error

If another Student acquires the final seat:

Title:

Section just filled up

Message:

Another student completed registration before your request.

Action:

Choose Another Section

Refresh relevant capacity information.

---

# 34. Switch Confirmation

Title:

Switch Section?

FROM

Section 2\
Sunday · 10:00–12:00

TO

Section 5\
Tuesday · 12:00–14:00

Message:

Your current section will remain reserved unless this switch succeeds.

Actions:

Cancel\
Confirm Switch

---

# 35. Switch Failure

Example:

"We couldn't complete the switch because the target section is now full.

Your current section is still reserved."

The UI must reassure the Student that their old registration remains intact.

---

# 36. Student Schedule

Route:

/schedule

Mobile default:

day-grouped list.

Example:

Saturday

08:00–10:00\
Distributed Systems\
Section 1\
Ahmed Mohamed

12:00–14:00\
Software Testing\
Section 3

Hide empty days when that improves readability.

Desktop may provide a weekly grid.

The grid must not replace a usable mobile experience.

---

# 37. Schedule Conflict

If an Admin creates a post-registration overlap:

show warning before/inside schedule.

Example:

Schedule Conflict

Sunday

10:00–12:00\
Distributed Systems

11:00–13:00\
Software Testing

These sections now overlap.

Use clear warning styling.

Do not automatically modify registrations.

---

# 38. Manage Courses

Route:

/courses

Header:

My Courses

12 / 19 Credit Hours

Action:

Add Course

Selected course cards show:

- name,

- code,

- credit hours,

- current section if registered,

- View,

- Remove.

---

# 39. Add Course

Provide:

- search,

- available course cards,

- current credit-hour total.

Example:

Current:\
16 / 19 CH

Course:

Computer Networks\
4 CH

Adding this course would exceed the 19 credit-hour limit.

\[ Add Course \]

disabled.

Server remains authoritative.

---

# 40. Remove Course Confirmation

Without section:

simple confirmation.

With section:

Title:

Remove Distributed Systems?

Message:

You are currently registered in:

Section 2\
Sunday · 10:00–12:00

Removing this course will also cancel your section registration.

The course admins will be notified.

Actions:

Cancel\
Remove Course

Use destructive styling for final action.

---

# 41. Student Profile

Route:

/profile

Display:

avatar/initials optional

Full name\
Academic level

University ID\
Email\
Completed Credit Hours\
Transferred This Year\
Language

Authentication and academic identity are separate. Display Student name and
university information from the Student record, and email/account controls from
the User account. Never expose internal IDs or imply that the two IDs match.

Account actions:

Change Password\
Logout

Academic level is read-only/derived.

Completed hours may be editable.

---

# 42. Admin Global Navigation

All Admin functionality must work on mobile.

Mobile primary navigation:

Home\
Courses\
Notifications\
More

Super Admin-specific destinations may live under More or an expanded navigation.

Desktop:

sidebar or wider navigation may be used.

Possible items:

Dashboard\
My Courses\
Notifications

Super Admin additions:

Courses\
Admins\
Audit Log

---

# 43. Admin Dashboard

Route:

/admin

Order:

1. Header

2. Needs Attention

3. My Courses

4. Relevant recent activity if useful

Do not add decorative analytics charts.

---

# 44. Needs Attention

Example card:

12 students haven't selected a section

Distributed Systems

\[ View Students \]

Only show actionable situations.

If nothing needs attention, do not create an artificial warning section.

---

# 45. Admin Course Card

Example:

Distributed Systems\
CS351

Students\
120

Registered\
108

Not Registered\
12

Sections\
4

Registration\
OPEN

Closes Sep 23 · 8:00 PM

\[ Manage Course \]

Mobile:

stack values cleanly.

Desktop:

may use a denser grid.

---

# 46. Notifications

Mobile accessible from global navigation.

Each notification displays:

- concise title/message,

- course context,

- time,

- read/unread state.

Example:

Baraa Mohamed removed Distributed Systems and released their seat in Section 2.

5 min ago

Unread notifications should be visible without being visually aggressive.

---

# 47. Admin Course Navigation

Route:

/admin/courses/\[courseId\]

Sections:

Overview\
Sections\
Students\
Announcements\
Settings

Mobile:

horizontal scrollable tabs or equivalent.

Desktop:

tabs or local sidebar.

Keep navigation stable while switching sections.

---

# 48. Admin Course Overview

Header:

Distributed Systems\
CS351

Registration:

OPEN

Sep 20 · 8 PM\
→ Sep 23 · 8 PM

Switching:

OPEN

Until Sep 27 · 8 PM

Students:

120 enrolled\
108 registered\
12 not registered

Sections:

4 sections

Quick Actions:

Add Section\
Announcement\
Registration Settings

Recent Activity may appear below.

---

# 49. Sections Management

Mobile:

section cards.

Desktop:

table where useful.

Mobile card example:

Section 1

Published

Saturday · 08:00–10:00\
Ahmed Mohamed

28 / 30 students\
2 seats available

\[ Edit \] \[ More \]

More menu:

Publish/Unpublish as applicable.

Delete only when allowed.

Deletion is always a destructive preview-and-confirm workflow. A populated
section lists each registered student with an optional target section. The
preview groups incoming counts by target, identifies registrations that will be
removed, and shows any resulting student schedule conflicts. Confirmation must
state that course selections are preserved.

Changing any transfer selection invalidates the displayed confirmation and
requires Preview deletion again. If server-side membership, target totals, or
schedule warnings change before confirmation, replace the old confirmation with
the fresh preview and require another explicit confirmation.

No hover-only actions.

---

# 50. Add Section

Use full-screen sheet/page on very small mobile if a normal dialog becomes cramped.

Fields:

Responsible Admin\
Day\
Start Time\
End Time\
Location\
Capacity\

New sections start unpublished. Publishing is a separate action on the section
card.

Actions:

Cancel\
Create Section

Responsible Admin options must only contain Admins assigned to the course.

---

# 51. Edit Section

Same base form as Add Section.

Show current registration count near Capacity.

Example:

Capacity\
\[ 30 \]

28 students currently registered.

If Admin attempts 25:

inline error:

"Section capacity cannot be decreased after creation."

The same error applies even if the requested capacity remains above the current
registration count.

---

# 52. Edit Section Time — No Conflicts

After changing day/time and requesting Save:

if registered Students exist, perform conflict preview.

No conflict:

"No student schedule conflicts found."

Proceed with Save.

Do not show unnecessary warning UI when there are no affected Students.

The same preview surface also reports overlapping sections for the responsible
Admin and for the normalized location. Conflict groups identify the other
course, section, day/time, Admin, or room so the override is informed.

---

# 53. Edit Section Time — Conflicts

Use a clear confirmation surface.

Title:

Schedule conflicts detected

Message:

Changing this section will create conflicts for 7 registered students.

Group conflicts:

Software Testing

Sunday · 12:00–14:00\
5 students affected\
Responsible: Mohamed Ali

Database Systems

Sunday · 13:00–15:00\
2 students affected\
Responsible: Sara Ahmed

Actions:

Cancel\
Change Anyway

Change Anyway uses warning/destructive emphasis without implying deletion.

---

# 54. Students Screen

Inside Admin Course.

Filters:

All\
Registered\
Not Registered

Search input:

Search by name or university ID

Mobile:

Student cards.

Desktop:

table.

Student information:

Full Name\
University ID\
Email\
Level\
Completed Hours\
Transferred status\
Section

---

# 55. Student Card — Registered

Example:

Baraa Mohamed Ahmed

ID: 2024xxxx

Level 3 · 72 CH

Section 2\
Sunday · 10:00–12:00

---

# 56. Student Card — Missing Section

Example:

Ahmed Ali

ID: 2024xxxx

Level 3\
Transferred

No section selected

Use warning/neutral attention styling.

Do not make it look like a system error.

---

# 57. Announcements Management

Inside Admin Course.

Header:

Announcements

\[ New Announcement \]

Announcement card:

title,\
short content preview,\
author,\
date/time.

Empty state:

"No announcements yet."

---

# 58. Create Announcement

Fields:

Title\
Content

Actions:

Cancel\
Publish Announcement

Keep form intentionally simple.

No rich text editor required for MVP.

---

# 59. Course Settings

Inside Admin Course.

Section:

Registration Window

Opens\
Closes\
Current status

Pause/Resume Registration

When paused, offer distinct actions:

Resume\
Resume + Extend

Resume preserves the original close time. Resume + Extend adds the actual pause
duration measured by the server. Editing dates while paused must not reset the
displayed pause start.

Section:

Switching Window

Opens\
Closes\
Current status

Pause/Resume Switching

Switching uses the same independent pause/resume behavior; changing one window
must not imply a change to the other.

Use clear distinction between:

scheduled closed

and

manually paused.

Example:

Registration Open · Paused by Admin

rather than simply:

Closed.

---

# 60. Super Admin UI

Reuse the Admin visual system.

Do not create a separate visual identity.

Additional destinations:

Courses\
Admins\
Audit Log

Admin names are displayed with a `Dr.` prefix. The stored name does not contain
the prefix.

---

# 61. Super Admin — Courses

Mobile:

course cards.

Desktop:

table/list.

Actions:

Create Course\
Edit Course\
Manage Admin Assignments

Course form:

Course Name\
Course Code\
Credit Hours\
Primary Admin\
Other Assigned Admins

Do not overload initial course creation with unrelated settings.

Registration settings can be managed from the course afterward.

---

# 62. Super Admin — Admins

List Admins/Super Admins.

Display:

name,\
email,\
role,\
assigned courses.

Also display pending Student link claims in an Identity Review section. Each
claim clearly separates:

- the existing authoritative Student name, university ID, completed hours, and
  transfer status,
- the unverified proposed name, completed hours, and transfer status submitted
  during registration, plus the requesting account email.

Use explicit labels such as "Existing academic record" and "Submitted account
data". Do not visually present proposed values as authoritative.

Actions where authorized:

Create Admin\
Manage Assignments\
Change Role

Pending claim actions:

Approve Link\
Reject

Approval copy must state that academic records stay attached to the Student
record. Rejection is non-destructive: neither the account nor academic record
is deleted.

Changing role requires confirmation.

If an action would result in zero Super Admins:

block it and explain why.

---

# 63. Create Admin

Fields:

Name after "Dr."\
Email\
Temporary Password

Role defaults to:

ADMIN

Do not default new users to SUPER_ADMIN.

---

# 64. Audit Log

Super Admin only.

Mobile:

stacked audit cards.

Desktop:

table.

Useful filters:

Actor\
Action\
Course/Entity\
Date

Entry example:

Ahmed Mohamed

SECTION_CAPACITY_CHANGED

Distributed Systems · Section 2

30 → 35

Sep 20 · 10:42 AM

Metadata should be rendered into useful human-readable information rather than raw JSON where practical.

---

# 65. Responsive Tables

When desktop uses a table:

do NOT simply overflow the same table horizontally on mobile as the primary experience.

At mobile breakpoint:

transform rows into cards or another intentional layout.

Important actions remain directly accessible.

---

# 66. Dialogs on Mobile

Small confirmations may remain centered dialogs.

Large forms or information-heavy previews should use a Sheet/Drawer/full-screen presentation where appropriate.

Examples suitable for larger mobile surface:

- Add Section

- Edit Section

- conflict preview

Avoid tiny scrollable desktop modals on phones.

---

# 67. Touch and Interaction

No critical action depends on:

hover,\
right-click,\
mouse precision.

Menus and buttons must be usable by touch.

Do not place destructive actions immediately beside frequent actions without adequate separation/confirmation.

---

# 68. Accessibility

Use semantic HTML.

Inputs require associated labels.

Buttons require accessible names.

Status must not depend on color alone.

Maintain reasonable contrast.

Dialogs must manage focus appropriately.

Keyboard navigation should remain usable.

Use shadcn/Radix accessibility behavior where appropriate rather than rebuilding primitives unnecessarily.

---

# 69. Content Style

Use short, clear product language.

Avoid technical implementation terminology in user-facing messages.

Student should see:

"Section is full."

Not:

"Capacity constraint rejected transaction."

Admin should see:

"Section capacity cannot be decreased after creation."

Not:

"Invalid capacity mutation."

---

# 70. Arabic Content

Arabic should read naturally, not as literal machine-translated English.

Keep terminology consistent.

Examples:

Section:\
سكشن

Course:\
مادة

Schedule:\
الجدول

Registration:\
تسجيل السكاشن when ambiguity exists.

Admin:\
معيد / مسؤول المادة depending on context.

Avoid overly formal governmental language.

The translation architecture should allow wording to be refined later without rewriting components.

---

# 71. Data Freshness

Capacity is time-sensitive.

After registration/switch:

refresh affected section information.

After failed final-seat attempt:

refresh capacities.

After Admin capacity update:

reflect new availability.

Do not leave clearly stale capacity after a mutation.

Real-time WebSockets are NOT required for MVP.

---

# 72. Student Priority Hierarchy

When deciding visual hierarchy, prioritize:

1. critical conflict/error,

2. registration requiring action,

3. upcoming registration deadline,

4. current registered sections,

5. announcements,

6. secondary profile information.

---

# 73. Admin Priority Hierarchy

Prioritize:

1. situations requiring attention,

2. registration operational state,

3. students missing sections,

4. section capacity/state,

5. notifications,

6. recent history.

Avoid making Admins search through analytics to find operational actions.

---

# 74. Success Criteria

The UI is successful when:

A Student can complete the main registration flow comfortably from a phone.

An Admin can create and manage sections comfortably from a phone.

Important blocked actions explain WHY.

The Student can understand their current registration state without opening several pages.

The Admin can quickly identify Students who still need sections.

The UI remains visually coherent in Arabic RTL and English LTR.

Desktop feels intentionally enhanced rather than simply stretched mobile.

The product does not look like a generic dashboard template.

---

# 75. Implementation Guidance

Prefer reusable components for repeated product concepts such as:

StatusBadge\
CourseCard\
SectionCard\
CapacityDisplay\
RegistrationWindowStatus\
ConflictAlert\
StudentSummary\
EmptyState\
ConfirmActionDialog

Do not prematurely create a huge design system.

Extract components when real repetition exists.

Use shadcn/ui primitives where they fit.

Keep business logic outside visual components.

The UI must render server-authoritative states rather than recreate critical business rules independently.

---

# 76. Final Visual Principle

Every screen should answer:

Where am I?

What is the current state?

What can I do?

What requires my attention?

Why can't I perform a blocked action?

If an element does not help answer one of these questions or improve usability, reconsider whether it belongs in the MVP.
