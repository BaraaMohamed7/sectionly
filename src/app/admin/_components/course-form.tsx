"use client";

import { useActionState } from "react";
import { type AdminActionState, saveCourseAction } from "@/app/admin/actions";

const INITIAL_ADMIN_ACTION_STATE: AdminActionState = { status: "idle" };

type CourseFormValues = {
  id?: string;
  code?: string;
  nameAr?: string;
  nameEn?: string;
  creditHours?: number;
};

export function CourseForm({ initial = {} }: { initial?: CourseFormValues }) {
  const [state, action, pending] = useActionState(
    saveCourseAction,
    INITIAL_ADMIN_ACTION_STATE,
  );

  return (
    <form action={action} className="admin-form">
      {initial.id ? (
        <input type="hidden" name="courseId" value={initial.id} />
      ) : null}
      <div className="admin-form-grid">
        <label>
          Course code
          <input
            name="code"
            required
            maxLength={64}
            defaultValue={initial.code}
            autoCapitalize="characters"
          />
        </label>
        <label>
          Credit hours
          <input
            name="creditHours"
            required
            type="number"
            min={1}
            step={1}
            defaultValue={initial.creditHours ?? 3}
          />
        </label>
        <label>
          English name
          <input
            name="nameEn"
            required
            maxLength={200}
            defaultValue={initial.nameEn}
          />
        </label>
        <label>
          Arabic name
          <input
            name="nameAr"
            required
            maxLength={200}
            dir="rtl"
            defaultValue={initial.nameAr}
          />
        </label>
      </div>

      <button className="admin-button" disabled={pending} type="submit">
        {pending ? "Saving..." : initial.id ? "Save changes" : "Create course"}
      </button>
      {state.status !== "idle" ? (
        <p
          className={`admin-action-result admin-action-result-${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
