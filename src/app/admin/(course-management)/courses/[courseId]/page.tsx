import { notFound } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import {
  AssignCourseAdminForm,
  CourseAdminControls,
} from "@/app/admin/_components/course-admin-controls";
import { CourseForm } from "@/app/admin/_components/course-form";
import { CourseOperations } from "@/app/admin/_components/course-operations";
import { requireUser } from "@/server/authorization";
import { getManageableCourse } from "@/server/course-management/queries";
import { listAdminAccounts } from "@/server/super-admin/admin-accounts";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const user = await requireUser();
  const { courseId } = await params;
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
  const [course, admins] = await Promise.all([
    getManageableCourse(user.id, courseId).catch(() => null),
    isSuperAdmin ? listAdminAccounts() : Promise.resolve([]),
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

      {isSuperAdmin ? (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">Catalog record</p>
              <h2>Course details</h2>
            </div>
          </div>
          <CourseForm
            initial={{
              id: course.id,
              code: course.code,
              nameAr: course.nameAr,
              nameEn: course.nameEn,
              creditHours: course.creditHours,
            }}
          />
        </section>
      ) : null}

      <CourseOperations course={course} />

      {isSuperAdmin ? <section className="admin-panel">
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
                  <h3>Dr. {assignment.admin.adminName}</h3>
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
      </section> : null}
    </div>
  );
}
