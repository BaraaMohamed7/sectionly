"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      className="h-11 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-700 hover:bg-slate-50"
      onClick={() => signOut({ callbackUrl: "/login" })}
      type="button"
    >
      Sign out
    </button>
  );
}
