"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  registerStudentAction,
  type RegistrationActionResult,
} from "./actions";

const initialState: RegistrationActionResult = { ok: false };

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? (
    <p className="mt-1 text-sm text-red-600">{errors[0]}</p>
  ) : null;
}

export function RegistrationForm() {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");

    setState(initialState);
    startTransition(async () => {
      const result = await registerStudentAction(formData);

      if (!result.ok) {
        setState(result);
        return;
      }

      try {
        const signInResult = await signIn("credentials", {
          email: result.email,
          password,
          callbackUrl: "/auth/continue",
          redirect: false,
        });

        if (!signInResult?.ok) {
          setState({
            ok: false,
            message: "Your account was created. Please sign in to continue.",
          });
          return;
        }

        router.replace("/auth/continue");
        router.refresh();
      } catch {
        setState({
          ok: false,
          message: "Your account was created. Please sign in to continue.",
        });
      }
    });
  }

  const fieldErrors = state.ok ? undefined : state.fieldErrors;

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="fullName">
          Full name
        </label>
        <input
          autoComplete="name"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="fullName"
          maxLength={120}
          minLength={2}
          name="fullName"
          required
        />
        <FieldError errors={fieldErrors?.fullName} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="universityId">
          University ID
        </label>
        <input
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="universityId"
          maxLength={64}
          name="universityId"
          required
        />
        <FieldError errors={fieldErrors?.universityId} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
        <FieldError errors={fieldErrors?.email} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        <FieldError errors={fieldErrors?.password} />
      </div>

      <div>
        <label
          className="mb-1.5 block text-sm font-semibold"
          htmlFor="completedCreditHours"
        >
          Completed credit hours
        </label>
        <input
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="completedCreditHours"
          max={2147483647}
          min={0}
          name="completedCreditHours"
          required
          step={1}
          type="number"
        />
        <FieldError errors={fieldErrors?.completedCreditHours} />
      </div>

      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
        <input
          className="h-4 w-4 rounded border-slate-300 text-blue-600"
          name="isTransferredThisYear"
          type="checkbox"
        />
        I transferred from another college or university this year.
      </label>

      {!state.ok && state.message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 w-full rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
