import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/server/auth/current-user";
import { LinkStatusRefresh } from "./link-status-refresh";

export default async function StudentLinkStatusPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== UserRole.STUDENT) redirect("/auth/continue");
  if (user.student) redirect("/auth/continue");
  const claim = user.requestedStudentLinks[0];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <LinkStatusRefresh />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600">Sectionly</p>
            <h1 className="mt-2 text-2xl font-bold">Student link review</h1>
          </div>
          <SignOutButton />
        </div>
        {claim?.status === "PENDING" ? (
          <p className="mt-4 leading-7 text-slate-600">
            Your account was created. A Super Admin must review the link to the
            existing academic Student record before Student features are available.
          </p>
        ) : (
          <p className="mt-4 leading-7 text-slate-600">
            This account is not linked to an academic Student record. Contact a
            Super Admin for assistance.
          </p>
        )}
      </section>
    </main>
  );
}
