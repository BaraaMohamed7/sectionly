import Link from "next/link";
import { CourseForm } from "@/app/admin/_components/course-form";
import { requireSuperAdmin } from "@/server/authorization";
import { listCourses } from "@/server/super-admin/courses";

export default async function CoursesPage() {
  await requireSuperAdmin();
  const courses = await listCourses();

  return (
    <div className="admin-page-stack">
      <section className="admin-page-heading">
        <p className="admin-eyebrow">Academic setup</p>
        <h1>Courses</h1>
        <p>
          Times entered here are interpreted in Africa/Cairo and stored as
          absolute instants.
        </p>
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">New course</p>
            <h2>Create course</h2>
          </div>
        </div>
        <CourseForm />
      </section>

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
                  <span>{course.admins.length} assigned</span>
                  <span>
                    {primary
                      ? `Primary: ${primary.admin.fullName}`
                      : "No primary Admin"}
                  </span>
                </footer>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
