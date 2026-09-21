import Link from "next/link";
import { UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/server/authorization";

export default async function AdminHomePage() {
  const user = await requireUser();

  if (user.role !== UserRole.SUPER_ADMIN) {
    return (
      <section className="admin-hero">
        <p className="admin-eyebrow">Admin workspace</p>
        <h1>Your assigned courses will appear here.</h1>
        <p>
          Course operations for regular Admins are planned for a later delivery
          slice.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="admin-hero">
        <p className="admin-eyebrow">System foundation</p>
        <h1>Keep access and courses ready for registration.</h1>
        <p>
          Create Admin accounts, maintain institutional course settings, and
          make course ownership explicit.
        </p>
      </section>
      <section className="admin-dashboard-grid" aria-label="Management areas">
        <Link className="admin-feature-card" href="/admin/courses">
          <span>01</span>
          <h2>Courses</h2>
          <p>Create courses, define Cairo-time windows, and assign Admins.</p>
          <strong>Manage courses →</strong>
        </Link>
        <Link className="admin-feature-card" href="/admin/admins">
          <span>02</span>
          <h2>Admin accounts</h2>
          <p>
            Control access, Super Admin membership, and temporary passwords.
          </p>
          <strong>Manage Admins →</strong>
        </Link>
      </section>
    </>
  );
}
