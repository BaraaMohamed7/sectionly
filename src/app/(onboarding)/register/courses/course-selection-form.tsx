"use client";

import { useActionState, useDeferredValue, useState } from "react";
import {
  completeOnboardingAction,
  type StudentCourseActionState,
} from "@/app/student-course-actions";
import { MAX_SELECTED_CREDIT_HOURS } from "@/lib/student-courses";

type Course = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  creditHours: number;
};

const INITIAL_STATE: StudentCourseActionState = { status: "idle" };

export function CourseSelectionForm({ courses }: { courses: Course[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [state, action, pending] = useActionState(
    completeOnboardingAction,
    INITIAL_STATE,
  );
  const selectedCourses = courses.filter((course) =>
    selectedIds.has(course.id),
  );
  const totalCreditHours = selectedCourses.reduce(
    (total, course) => total + course.creditHours,
    0,
  );
  const visibleCourses = courses.filter((course) => {
    if (!deferredQuery) return true;
    return `${course.code} ${course.nameEn} ${course.nameAr}`
      .toLowerCase()
      .includes(deferredQuery);
  });

  function toggleCourse(course: Course) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(course.id)) next.delete(course.id);
      else next.add(course.id);
      return next;
    });
  }

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            Search courses
          </span>
          <input
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Course name or code"
            type="search"
            value={query}
          />
        </label>

        {visibleCourses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            No courses match your search.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleCourses.map((course) => {
              const selected = selectedIds.has(course.id);
              const exceedsLimit =
                !selected &&
                totalCreditHours + course.creditHours >
                  MAX_SELECTED_CREDIT_HOURS;

              return (
                <label
                  className={`flex min-h-36 cursor-pointer flex-col rounded-xl border p-4 transition ${
                    selected
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                      : exceedsLimit
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                        : "border-slate-200 bg-white hover:border-blue-300"
                  }`}
                  key={course.id}
                >
                  <input
                    checked={selected}
                    className="sr-only"
                    disabled={exceedsLimit}
                    name="courseId"
                    onChange={() => toggleCourse(course)}
                    type="checkbox"
                    value={course.id}
                  />
                  <span className="flex items-center justify-between gap-3">
                    <strong className="font-mono text-sm text-blue-700">
                      {course.code}
                    </strong>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                      {course.creditHours} CH
                    </span>
                  </span>
                  <strong className="mt-4 leading-6">{course.nameEn}</strong>
                  <span className="mt-1 text-sm text-slate-500" dir="rtl">
                    {course.nameAr}
                  </span>
                  <span className="mt-auto pt-3 text-xs font-semibold">
                    {selected
                      ? "Selected"
                      : exceedsLimit
                        ? "Would exceed 19 CH"
                        : "Select course"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <aside className="h-fit rounded-xl border border-blue-200 bg-white p-5 lg:sticky lg:top-6">
        <p className="text-sm font-semibold text-slate-600">Selected load</p>
        <p className="mt-1 text-3xl font-bold text-slate-950">
          {totalCreditHours}
          <span className="text-base font-semibold text-slate-500">
            {" "}
            / {MAX_SELECTED_CREDIT_HOURS} CH
          </span>
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {selectedCourses.length} course
          {selectedCourses.length === 1 ? "" : "s"} selected
        </p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-[width]"
            style={{
              width: `${(totalCreditHours / MAX_SELECTED_CREDIT_HOURS) * 100}%`,
            }}
          />
        </div>

        {state.status === "error" ? (
          <p
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        <button
          className="mt-5 min-h-11 w-full rounded-lg bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-400"
          disabled={pending}
          type="submit"
        >
          {pending ? "Confirming..." : "Confirm course selection"}
        </button>
        <p className="mt-3 text-center text-xs leading-5 text-slate-500">
          You can add or remove courses later.
        </p>
      </aside>
    </form>
  );
}
