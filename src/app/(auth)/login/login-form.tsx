"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const AUTHENTICATION_ERROR = "Invalid email or password.";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setError(undefined);
    startTransition(async () => {
      try {
        const result = await signIn("credentials", {
          email,
          password,
          callbackUrl: "/auth/continue",
          redirect: false,
        });

        if (!result?.ok) {
          setError(AUTHENTICATION_ERROR);
          return;
        }

        router.replace("/auth/continue");
        router.refresh();
      } catch {
        setError(AUTHENTICATION_ERROR);
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="h-11 w-full rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
