import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { RegistrationForm } from "./registration-form";

export default async function RegisterPage() {
  if (await getCurrentUser()) {
    redirect("/auth/continue");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="mb-6">
        <p className="mb-2 text-sm font-semibold text-blue-600">Sectionly</p>
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter your student information before selecting courses.
        </p>
      </header>

      <RegistrationForm />

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link className="font-semibold text-blue-600 hover:text-blue-700" href="/login">
          Sign in
        </Link>
      </p>
    </section>
  );
}
