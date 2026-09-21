import Link from "next/link";
import { UserRole } from "@/generated/prisma/client";
import {
  AdminAccountControls,
  CreateAdminForm,
} from "@/app/admin/_components/admin-forms";
import { requireSuperAdmin } from "@/server/authorization";
import { listAdminAccounts } from "@/server/super-admin/admin-accounts";

export default async function AdminAccountsPage() {
  await requireSuperAdmin();
  const admins = await listAdminAccounts();

  return (
    <div className="admin-page-stack">
      <section className="admin-page-heading">
        <p className="admin-eyebrow">Access control</p>
        <h1>Admin accounts</h1>
        <p>
          Accounts are deactivated rather than deleted so assignments and audit
          history remain intact.
        </p>
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">New account</p>
            <h2>Create an Admin</h2>
          </div>
          <p>A temporary password is shown once after creation.</p>
        </div>
        <CreateAdminForm />
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">Directory</p>
            <h2>{admins.length} Admin accounts</h2>
          </div>
        </div>
        <div className="admin-card-list">
          {admins.map((admin) => (
            <article className="admin-record-card" key={admin.id}>
              <div className="admin-record-summary">
                <div>
                  <h3>{admin.fullName}</h3>
                  <p>{admin.email}</p>
                </div>
                <div className="admin-badges">
                  <span className="admin-badge admin-badge-blue">
                    {admin.role === UserRole.SUPER_ADMIN
                      ? "Super Admin"
                      : "Admin"}
                  </span>
                  <span
                    className={`admin-badge ${
                      admin.isActive ? "admin-badge-green" : "admin-badge-muted"
                    }`}
                  >
                    {admin.isActive ? "Active" : "Inactive"}
                  </span>
                  {admin.mustChangePassword ? (
                    <span className="admin-badge admin-badge-amber">
                      Password change due
                    </span>
                  ) : null}
                </div>
              </div>
              <AdminAccountControls
                adminId={admin.id}
                isActive={admin.isActive}
                role={admin.role}
              />
              <Link
                className="admin-text-link"
                href={`/admin/admins/${admin.id}`}
              >
                View account and course assignments
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
