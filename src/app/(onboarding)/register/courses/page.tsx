import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  AuthorizationError,
  requireStudent,
} from "@/server/authorization";

export default async function OnboardingCoursesPlaceholderPage() {
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

  if (student.onboardingCompletedAt) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sky-50 px-4 py-10 text-slate-900">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-2 text-sm font-semibold text-blue-600">Sectionly</p>
        <h1 className="text-2xl font-bold">Welcome, {student.fullName}</h1>
        <p className="mt-3 text-slate-600">
          Your account is ready. Course selection will be added in the next implementation slice.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
