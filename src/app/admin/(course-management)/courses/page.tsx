import Link from "next/link";
import { CourseForm } from "@/app/admin/_components/course-form";
import { UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/server/authorization";
import { listManageableCourses } from "@/server/course-management/queries";

export default async function CoursesPage() {
  const user = await requireUser();
  const courses = await listManageableCourses(user.id);
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  return (
    <div className="admin-page-stack">
      <section className="admin-page-heading">
        <p className="admin-eyebrow">Academic setup</p>
        <h1>Courses</h1>
        <p>
          {isSuperAdmin
            ? "Maintain the catalog, then open a course to manage its weekly sections."
            : "Open an assigned course to manage sections and registration windows."}
        </p>
      </section>

      {isSuperAdmin ? (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">New course</p>
              <h2>Create course</h2>
            </div>
          </div>
          <CourseForm />
        </section>
      ) : null}

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">Catalog</p>
            <h2>{courses.length} courses</h2>
          </div>
        </div>
        <div className="admin-course-grid">
          {courses.map((course) => {
            const primary = course.admins.find((admin) => admin.isPrimary);
            return (
              <Link
                className="admin-course-card"
                href={`/admin/courses/${course.id}`}
                key={course.id}
              >
                <div>
                  <span className="admin-course-code">{course.code}</span>
                  <span>{course.creditHours} credit hours</span>
                </div>
                <h3>{course.nameEn}</h3>
                <p dir="rtl">{course.nameAr}</p>
                <footer>
                  <span>
                    {course._count.sections} sections · {course._count.enrollments}{" "}
                    students
                  </span>
                  <span>
                    {primary
                      ? `Primary: Dr. ${primary.admin.adminName}`
                      : "No primary Admin"}
                  </span>
                </footer>
              </Link>
            );
          })}
          {courses.length === 0 ? (
            <p className="admin-empty-state">
              No courses are assigned to your account.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
