import Link from "next/link";
import { UserRole } from "@/generated/prisma/client";
import {
  AdminAccountControls,
  CreateAdminForm,
  StudentLinkClaimControls,
} from "@/app/admin/_components/admin-forms";
import { requireSuperAdmin } from "@/server/authorization";
import { listAdminAccounts } from "@/server/super-admin/admin-accounts";
import { listPendingStudentLinkClaims } from "@/server/super-admin/student-links";

export default async function AdminAccountsPage() {
  await requireSuperAdmin();
  const [admins, claims] = await Promise.all([
    listAdminAccounts(),
    listPendingStudentLinkClaims(),
  ]);

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
            <p className="admin-eyebrow">Identity review</p>
            <h2>{claims.length} pending Student links</h2>
          </div>
          <p>
            Approval links the account and may fill missing profile fields from
            the submitted data. Rejection preserves both records unchanged.
          </p>
        </div>
        <div className="admin-card-list">
          {claims.map((claim) => (
            <article className="admin-record-card" key={claim.id}>
              <div className="admin-record-summary">
                <div>
                  <h3>{claim.student.universityId}</h3>
                  <p>Compare the academic record with the submitted claim.</p>
                </div>
                <span className="admin-badge admin-badge-amber">Pending</span>
              </div>
              <div className="admin-identity-comparison">
                <section>
                  <h4>Existing academic record</h4>
                  <dl>
                    <IdentityValue label="Full name" value={claim.student.fullName} />
                    <IdentityValue
                      label="University ID"
                      value={claim.student.universityId}
                    />
                    <IdentityValue
                      label="Completed credit hours"
                      value={formatCreditHours(
                        claim.student.completedCreditHours,
                        "Not recorded",
                      )}
                    />
                    <IdentityValue
                      label="Transferred this year"
                      value={formatBoolean(
                        claim.student.isTransferredThisYear,
                        "Not recorded",
                      )}
                    />
                  </dl>
                </section>
                <section>
                  <h4>Submitted account data</h4>
                  <p className="admin-unverified-note">
                    User-submitted and unverified until this claim is approved.
                  </p>
                  <dl>
                    <IdentityValue
                      label="Proposed full name"
                      value={claim.proposedFullName ?? "Not captured"}
                    />
                    <IdentityValue
                      label="Proposed completed credit hours"
                      value={formatCreditHours(
                        claim.proposedCompletedCreditHours,
                        "Not captured",
                      )}
                    />
                    <IdentityValue
                      label="Proposed transferred this year"
                      value={formatBoolean(
                        claim.proposedIsTransferredThisYear,
                        "Not captured",
                      )}
                    />
                    <IdentityValue label="Account email" value={claim.user.email} />
                  </dl>
                </section>
              </div>
              <StudentLinkClaimControls claimId={claim.id} />
            </article>
          ))}
          {claims.length === 0 ? (
            <p className="admin-empty-state">No Student links need review.</p>
          ) : null}
        </div>
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
                  <h3>Dr. {admin.adminName}</h3>
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

function IdentityValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatCreditHours(value: number | null, missing: string) {
  return value === null ? missing : `${value} hours`;
}

function formatBoolean(value: boolean | null, missing: string) {
  return value === null ? missing : value ? "Yes" : "No";
}
