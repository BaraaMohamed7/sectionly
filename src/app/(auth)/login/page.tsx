import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/auth/continue");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="mb-6">
        <p className="mb-2 text-sm font-semibold text-blue-600">Sectionly</p>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use your email and password to continue.
        </p>
      </header>

      <LoginForm />

      <p className="mt-6 text-center text-sm text-slate-600">
        New to Sectionly?{" "}
        <Link className="font-semibold text-blue-600 hover:text-blue-700" href="/register">
          Create an account
        </Link>
      </p>
    </section>
  );
}
