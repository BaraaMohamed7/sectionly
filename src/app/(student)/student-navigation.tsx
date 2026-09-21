"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/courses", label: "Courses" },
];

export function StudentNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Student navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-2 sm:static sm:border-t-0 sm:border-b sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-6xl justify-around gap-2 sm:justify-start">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`min-h-11 min-w-28 rounded-lg px-4 py-2.5 text-center text-sm font-bold no-underline ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
