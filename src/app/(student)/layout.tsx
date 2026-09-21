import Link from "next/link";
import { Cairo } from "next/font/google";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/server/auth/current-user";
import { StudentNavigation } from "./student-navigation";

const cairo = Cairo({ subsets: ["arabic", "latin"] });

export default async function StudentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const student = await getCurrentUser();

  if (!student) redirect("/login");
  if (student.mustChangePassword) redirect("/change-password");
  if (student.role !== UserRole.STUDENT) redirect("/auth/continue");
  if (!student.onboardingCompletedAt) redirect("/register/courses");

  return (
    <div
      className={`${cairo.className} min-h-screen bg-slate-50 text-slate-900`}
    >
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            className="flex items-center gap-3 no-underline"
            href="/dashboard"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-lg font-black text-white">
              S
            </span>
            <span>
              <strong className="block text-slate-900">Sectionly</strong>
              <small className="block text-slate-500">Student portal</small>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-slate-600 sm:inline">
              {student.fullName}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <StudentNavigation />
      <main className="mx-auto w-full max-w-6xl px-4 py-7 pb-28 sm:px-6 sm:py-10 sm:pb-10">
        {children}
      </main>
    </div>
  );
}
