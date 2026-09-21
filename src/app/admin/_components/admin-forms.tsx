"use client";

import { useActionState } from "react";
import type { UserRole } from "@/generated/prisma/client";
import {
  type AdminActionState,
  createAdminAction,
  manageAdminAction,
} from "@/app/admin/actions";

const INITIAL_ADMIN_ACTION_STATE: AdminActionState = { status: "idle" };

export function CreateAdminForm() {
  const [state, action, pending] = useActionState(
    createAdminAction,
    INITIAL_ADMIN_ACTION_STATE,
  );

  return (
    <form action={action} className="admin-form">
      <div className="admin-form-grid">
        <label>
          Full name
          <input name="fullName" required minLength={2} maxLength={120} />
        </label>
        <label>
          Email
          <input name="email" required type="email" maxLength={254} />
        </label>
      </div>
      <button className="admin-button" disabled={pending} type="submit">
        {pending ? "Creating..." : "Create Admin"}
      </button>
      <ActionResult state={state} />
    </form>
  );
}

export function AdminAccountControls({
  adminId,
  isActive,
  role,
}: {
  adminId: string;
  isActive: boolean;
  role: UserRole;
}) {
  const [state, action, pending] = useActionState(
    manageAdminAction,
    INITIAL_ADMIN_ACTION_STATE,
  );

  return (
    <form action={action} className="admin-control-form">
      <input type="hidden" name="adminId" value={adminId} />
      <div className="admin-button-row">
        <button
          className="admin-button admin-button-secondary"
          disabled={pending}
          name="intent"
          value={isActive ? "deactivate" : "activate"}
        >
          {isActive ? "Deactivate" : "Activate"}
        </button>
        <button
          className="admin-button admin-button-secondary"
          disabled={pending}
          name="intent"
          value={role === "SUPER_ADMIN" ? "demote" : "promote"}
        >
          {role === "SUPER_ADMIN"
            ? "Demote to Admin"
            : "Promote to Super Admin"}
        </button>
        <button
          className="admin-button admin-button-warning"
          disabled={pending}
          name="intent"
          value="reissue-password"
        >
          Reissue temporary password
        </button>
      </div>
      <ActionResult state={state} />
    </form>
  );
}

function ActionResult({ state }: { state: AdminActionState }) {
  if (state.status === "idle") {
    return null;
  }

  return (
    <div
      className={`admin-action-result admin-action-result-${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      <p>{state.message}</p>
      {state.temporaryPassword ? (
        <div className="temporary-password">
          <strong>Shown once</strong>
          <code>{state.temporaryPassword}</code>
          <span>
            This value disappears when you leave or refresh this page.
          </span>
        </div>
      ) : null}
    </div>
  );
}
