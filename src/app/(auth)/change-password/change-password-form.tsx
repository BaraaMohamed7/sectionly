"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  type ChangePasswordActionState,
} from "./actions";

const initialState: ChangePasswordActionState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="currentPassword">
          Current password
        </label>
        <input
          autoComplete="current-password"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="currentPassword"
          name="currentPassword"
          required
          type="password"
        />
        {state.fieldErrors?.currentPassword?.[0] ? (
          <p className="mt-1 text-sm text-red-600">
            {state.fieldErrors.currentPassword[0]}
          </p>
        ) : null}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="newPassword">
          New password
        </label>
        <input
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          id="newPassword"
          minLength={8}
          name="newPassword"
          required
          type="password"
        />
        {state.fieldErrors?.newPassword?.[0] ? (
          <p className="mt-1 text-sm text-red-600">
            {state.fieldErrors.newPassword[0]}
          </p>
        ) : null}
      </div>

      {state.message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 w-full rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Changing password..." : "Change password"}
      </button>
    </form>
  );
}
