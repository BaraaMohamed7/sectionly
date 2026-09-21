"use client";

import { useActionState } from "react";
import {
  type AdminActionState,
  manageCourseAdminAction,
} from "@/app/admin/actions";

const INITIAL_ADMIN_ACTION_STATE: AdminActionState = { status: "idle" };

type AdminOption = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
};

export function AssignCourseAdminForm({
  courseId,
  admins,
}: {
  courseId: string;
  admins: AdminOption[];
}) {
  const [state, action, pending] = useActionState(
    manageCourseAdminAction,
    INITIAL_ADMIN_ACTION_STATE,
  );

  return (
    <form action={action} className="admin-control-form">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="admin-inline-form">
        <label>
          Admin
          <select name="adminId" required defaultValue="">
            <option value="" disabled>
              Select an Admin
            </option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.fullName} · {admin.email}
                {admin.isActive ? "" : " · inactive"}
              </option>
            ))}
          </select>
        </label>
        <button
          className="admin-button"
          disabled={pending || admins.length === 0}
          name="intent"
          value="assign"
        >
          Assign
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function CourseAdminControls({
  courseId,
  adminId,
  isPrimary,
}: {
  courseId: string;
  adminId: string;
  isPrimary: boolean;
}) {
  const [state, action, pending] = useActionState(
    manageCourseAdminAction,
    INITIAL_ADMIN_ACTION_STATE,
  );

  return (
    <form action={action} className="admin-control-form">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="adminId" value={adminId} />
      <div className="admin-button-row">
        <button
          className="admin-button admin-button-secondary"
          disabled={pending}
          name="intent"
          value={isPrimary ? "clear-primary" : "make-primary"}
        >
          {isPrimary ? "Clear primary" : "Make primary"}
        </button>
        <button
          className="admin-button admin-button-danger"
          disabled={pending}
          name="intent"
          value="unassign"
        >
          Unassign
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

function ActionMessage({ state }: { state: AdminActionState }) {
  return state.status === "idle" ? null : (
    <p
      className={`admin-action-result admin-action-result-${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}
