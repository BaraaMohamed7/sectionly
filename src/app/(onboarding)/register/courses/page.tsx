import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AuthorizationError, requireStudent } from "@/server/authorization";
import { listCoursesForOnboarding } from "@/server/student-courses/service";
import { CourseSelectionForm } from "./course-selection-form";

export default async function OnboardingCoursesPage() {
  let student;

  try {
    student = await requireStudent();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }

      if (error.code === "PASSWORD_CHANGE_REQUIRED") {
        redirect("/change-password");
      }

      redirect("/auth/continue");
    }

    throw error;
  }

  const courses = await listCoursesForOnboarding();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm font-bold text-blue-600">Sectionly</p>
            <p className="text-sm text-slate-500">Initial course selection</p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-7 max-w-2xl">
          <p className="mb-2 text-sm font-bold tracking-wide text-blue-600 uppercase">
            Welcome, {student.student.fullName}
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Select the courses you are taking
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            Choose up to 19 credit hours. There is no minimum, so you can also
            continue without selecting a course.
          </p>
        </div>
        <CourseSelectionForm courses={courses} />
      </section>
    </main>
  );
}
