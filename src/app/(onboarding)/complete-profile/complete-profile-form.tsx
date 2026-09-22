"use client";

import { useActionState } from "react";
import {
  completeProfileAction,
  type CompleteProfileActionState,
} from "./actions";

const INITIAL_STATE: CompleteProfileActionState = { status: "idle" };

export function CompleteProfileForm({
  completedCreditHours,
  isTransferredThisYear,
}: {
  completedCreditHours: number | null;
  isTransferredThisYear: boolean | null;
}) {
  const [state, action, pending] = useActionState(
    completeProfileAction,
    INITIAL_STATE,
  );

  return (
    <form action={action} className="mt-6 grid gap-4">
      {completedCreditHours === null ? (
        <label className="grid gap-1.5 text-sm font-semibold">
          Completed credit hours
          <input
            className="h-11 rounded-lg border border-slate-300 px-3"
            max={2147483647}
            min={0}
            name="completedCreditHours"
            required
            step={1}
            type="number"
          />
        </label>
      ) : (
        <input
          name="completedCreditHours"
          type="hidden"
          value={completedCreditHours}
        />
      )}
      {isTransferredThisYear === null ? (
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input name="isTransferredThisYear" type="checkbox" />
          I transferred from another college or university this year.
        </label>
      ) : (
        <input
          name="isTransferredThisYear"
          type="hidden"
          value={isTransferredThisYear ? "on" : "off"}
        />
      )}
      {state.status === "error" ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.message}
        </p>
      ) : null}
      <button
        className="h-11 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:bg-slate-400"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving..." : "Complete profile"}
      </button>
    </form>
  );
}
