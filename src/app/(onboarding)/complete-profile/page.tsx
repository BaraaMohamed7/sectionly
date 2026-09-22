import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireLinkedStudent } from "@/server/authorization";
import { CompleteProfileForm } from "./complete-profile-form";

export default async function CompleteProfilePage() {
  const user = await requireLinkedStudent().catch(() => redirect("/auth/continue"));
  if (
    user.student.completedCreditHours !== null &&
    user.student.isTransferredThisYear !== null
  ) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600">Sectionly</p>
            <h1 className="mt-2 text-2xl font-bold">Complete your profile</h1>
          </div>
          <SignOutButton />
        </div>
        <p className="mt-3 text-slate-600">
          Add the remaining academic details before using Student features.
        </p>
        <CompleteProfileForm
          completedCreditHours={user.student.completedCreditHours}
          isTransferredThisYear={user.student.isTransferredThisYear}
        />
      </section>
    </main>
  );
}
