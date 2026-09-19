import { redirect } from "next/navigation";
import {
  AuthorizationError,
  requireAuthenticatedUser,
} from "@/server/authorization";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  try {
    await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login");
    }

    throw error;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="mb-6">
        <p className="mb-2 text-sm font-semibold text-blue-600">Sectionly</p>
        <h1 className="text-2xl font-bold">Change password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose a new password before continuing.
        </p>
      </header>

      <ChangePasswordForm />
    </section>
  );
}
