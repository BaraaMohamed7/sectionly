import Link from "next/link";
import { UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/server/authorization";
import { listManageableCourses } from "@/server/course-management/queries";

export default async function AdminHomePage() {
  const user = await requireUser();

  if (user.role !== UserRole.SUPER_ADMIN) {
    const courses = await listManageableCourses(user.id);
    return (
      <div className="admin-page-stack">
        <section className="admin-hero">
          <p className="admin-eyebrow">Admin workspace</p>
          <h1>Run the courses assigned to you.</h1>
          <p>
            Maintain weekly sections, resolve operational conflicts, and control
            registration and switching windows.
          </p>
        </section>
        <section className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">Your responsibility</p>
              <h2>{courses.length} manageable courses</h2>
            </div>
          </div>
          <div className="admin-course-grid">
            {courses.map((course) => (
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
                  <span>{course._count.sections} sections</span>
                  <span>{course._count.enrollments} students</span>
                </footer>
              </Link>
            ))}
            {courses.length === 0 ? (
              <p className="admin-empty-state">
                No courses are assigned to your account yet.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <section className="admin-hero">
        <p className="admin-eyebrow">System foundation</p>
        <h1>Keep access and courses ready for registration.</h1>
        <p>
          Create Admin accounts, maintain institutional course settings, and
          make course ownership explicit.
        </p>
      </section>
      <section className="admin-dashboard-grid" aria-label="Management areas">
        <Link className="admin-feature-card" href="/admin/courses">
          <span>01</span>
          <h2>Courses</h2>
          <p>Create courses, define Cairo-time windows, and assign Admins.</p>
          <strong>Manage courses →</strong>
        </Link>
        <Link className="admin-feature-card" href="/admin/admins">
          <span>02</span>
          <h2>Admin accounts</h2>
          <p>
            Control access, Super Admin membership, and temporary passwords.
          </p>
          <strong>Manage Admins →</strong>
        </Link>
      </section>
    </>
  );
}
