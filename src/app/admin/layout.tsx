import Link from "next/link";
import { redirect } from "next/navigation";
import { Cairo } from "next/font/google";
import { UserRole } from "@/generated/prisma/client";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/server/auth/current-user";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-admin",
});

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }
  if (user.mustChangePassword) {
    redirect("/change-password");
  }
  if (user.role === UserRole.STUDENT) {
    redirect("/auth/continue");
  }

  return (
    <div className={`${cairo.variable} admin-shell`}>
      <header className="admin-header">
        <Link className="admin-brand" href="/admin">
          <span className="admin-brand-mark">S</span>
          <span>
            <strong>Sectionly</strong>
            <small>
              {user.role === UserRole.SUPER_ADMIN
                ? "Super Admin"
                : "Admin workspace"}
            </small>
          </span>
        </Link>
        <div className="admin-header-actions">
          <span className="admin-user-name">Dr. {user.adminName}</span>
          <SignOutButton />
        </div>
      </header>
      <nav className="admin-nav" aria-label="Admin navigation">
        <Link href="/admin">Overview</Link>
        <Link href="/admin/courses">Courses</Link>
        {user.role === UserRole.SUPER_ADMIN ? (
          <Link href="/admin/admins">Admins</Link>
        ) : null}
      </nav>
      <main className="admin-main">{children}</main>
    </div>
  );
}
