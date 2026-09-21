import { notFound } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { AdminAccountControls } from "@/app/admin/_components/admin-forms";
import { requireSuperAdmin } from "@/server/authorization";
import { getAdminAccount } from "@/server/super-admin/admin-accounts";

export default async function AdminAccountPage({
  params,
}: {
  params: Promise<{ adminId: string }>;
}) {
  await requireSuperAdmin();
  const { adminId } = await params;
  const admin = await getAdminAccount(adminId).catch(() => null);

  if (!admin) {
    notFound();
  }

  return (
    <div className="admin-page-stack">
      <section className="admin-page-heading">
        <p className="admin-eyebrow">Admin account</p>
        <h1>{admin.fullName}</h1>
        <p>{admin.email}</p>
        <div className="admin-badges">
          <span className="admin-badge admin-badge-blue">
            {admin.role === UserRole.SUPER_ADMIN ? "Super Admin" : "Admin"}
          </span>
          <span
            className={`admin-badge ${
              admin.isActive ? "admin-badge-green" : "admin-badge-muted"
            }`}
          >
            {admin.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </section>

      <section className="admin-panel">
        <h2>Account controls</h2>
        <AdminAccountControls
          adminId={admin.id}
          isActive={admin.isActive}
          role={admin.role}
        />
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">Course access</p>
            <h2>Assignments</h2>
          </div>
        </div>
        {admin.courseAssignments.length === 0 ? (
          <p className="admin-empty-state">No course assignments yet.</p>
        ) : (
          <div className="admin-compact-list">
            {admin.courseAssignments.map((assignment) => (
              <div key={assignment.course.id}>
                <span>
                  <strong>{assignment.course.code}</strong>{" "}
                  {assignment.course.nameEn}
                </span>
                {assignment.isPrimary ? (
                  <span className="admin-badge admin-badge-blue">Primary</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
