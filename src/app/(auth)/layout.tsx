import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sky-50 px-4 py-10 text-slate-900">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
