import { requireStudent } from "@/server/authorization";
import { getStudentCourseOverview } from "@/server/student-courses/service";
import { CourseManagement } from "./course-management";

export default async function StudentCoursesPage() {
  const student = await requireStudent();
  const overview = await getStudentCourseOverview(student.id);

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-bold text-blue-600">Course selection</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Manage Courses
        </h1>
        <p className="mt-2 max-w-2xl leading-7 text-slate-600">
          Add or remove the courses you are currently taking. Your selected load
          cannot exceed 19 credit hours.
        </p>
      </section>
      <CourseManagement overview={overview} />
    </div>
  );
}
