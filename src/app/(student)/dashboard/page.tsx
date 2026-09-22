import Link from "next/link";
import { MAX_SELECTED_CREDIT_HOURS } from "@/lib/student-courses";
import { requireStudent } from "@/server/authorization";
import { getStudentCourseOverview } from "@/server/student-courses/service";

export default async function StudentDashboardPage() {
  const student = await requireStudent();
  const overview = await getStudentCourseOverview(student.id);

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-bold text-blue-600">Student dashboard</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back, {student.student.fullName}
        </h1>
        <p className="mt-2 text-slate-600">
          Review the courses you are currently taking in Sectionly.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Selected courses"
          value={overview.selectedCourses.length}
        />
        <SummaryCard
          label="Selected credit hours"
          value={`${overview.totalCreditHours} / ${MAX_SELECTED_CREDIT_HOURS}`}
        />
        <SummaryCard
          label="Credit hours remaining"
          value={overview.remainingCreditHours}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">
              Current selection
            </p>
            <h2 className="mt-1 text-xl font-bold">My Courses</h2>
          </div>
          <Link
            className="min-h-11 rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-bold text-blue-700 no-underline hover:bg-blue-50"
            href="/courses"
          >
            Manage Courses
          </Link>
        </div>

        {overview.selectedCourses.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-7 text-center">
            <p className="font-semibold">
              You haven&apos;t selected any courses yet.
            </p>
            <Link
              className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white no-underline hover:bg-blue-700"
              href="/courses"
            >
              Add Course
            </Link>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview.selectedCourses.map((course) => (
              <article
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                key={course.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-bold text-blue-700">
                    {course.code}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {course.creditHours} CH
                  </span>
                </div>
                <h3 className="mt-4 font-bold">{course.nameEn}</h3>
                <p className="mt-1 text-sm text-slate-500" dir="rtl">
                  {course.nameAr}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </article>
  );
}
