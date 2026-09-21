import { notFound } from "next/navigation";
import {
  AssignCourseAdminForm,
  CourseAdminControls,
} from "@/app/admin/_components/course-admin-controls";
import { CourseForm } from "@/app/admin/_components/course-form";
import { requireSuperAdmin } from "@/server/authorization";
import { listAdminAccounts } from "@/server/super-admin/admin-accounts";
import { getCourse } from "@/server/super-admin/courses";
import { formatCairoDateTimeInput } from "@/server/timezone";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requireSuperAdmin();
  const { courseId } = await params;
  const [course, admins] = await Promise.all([
    getCourse(courseId).catch(() => null),
    listAdminAccounts(),
  ]);

  if (!course) {
    notFound();
  }

  const assignedIds = new Set(
    course.admins.map((assignment) => assignment.admin.id),
  );
  const availableAdmins = admins.filter((admin) => !assignedIds.has(admin.id));

  return (
    <div className="admin-page-stack">
      <section className="admin-page-heading">
        <p className="admin-eyebrow">{course.code}</p>
        <h1>{course.nameEn}</h1>
        <p dir="rtl">{course.nameAr}</p>
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">Course settings</p>
            <h2>Details and windows</h2>
          </div>
        </div>
        <CourseForm
          initial={{
            id: course.id,
            code: course.code,
            nameAr: course.nameAr,
            nameEn: course.nameEn,
            creditHours: course.creditHours,
            registrationOpensAt: formatOptionalDate(course.registrationOpensAt),
            registrationClosesAt: formatOptionalDate(
              course.registrationClosesAt,
            ),
            switchingOpensAt: formatOptionalDate(course.switchingOpensAt),
            switchingClosesAt: formatOptionalDate(course.switchingClosesAt),
            registrationPaused: course.registrationPaused,
            switchingPaused: course.switchingPaused,
          }}
        />
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">Course access</p>
            <h2>Assigned Admins</h2>
          </div>
          <p>Primary is optional and informational.</p>
        </div>
        <AssignCourseAdminForm courseId={course.id} admins={availableAdmins} />
        <div className="admin-card-list admin-assignment-list">
          {course.admins.map((assignment) => (
            <article className="admin-record-card" key={assignment.admin.id}>
              <div className="admin-record-summary">
                <div>
                  <h3>{assignment.admin.fullName}</h3>
                  <p>{assignment.admin.email}</p>
                </div>
                <div className="admin-badges">
                  {assignment.isPrimary ? (
                    <span className="admin-badge admin-badge-blue">
                      Primary
                    </span>
                  ) : null}
                  {!assignment.admin.isActive ? (
                    <span className="admin-badge admin-badge-muted">
                      Inactive
                    </span>
                  ) : null}
                </div>
              </div>
              <CourseAdminControls
                courseId={course.id}
                adminId={assignment.admin.id}
                isPrimary={assignment.isPrimary}
              />
            </article>
          ))}
          {course.admins.length === 0 ? (
            <p className="admin-empty-state">No Admins assigned yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function formatOptionalDate(date: Date | null) {
  return date ? formatCairoDateTimeInput(date) : "";
}
