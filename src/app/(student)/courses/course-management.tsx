"use client";

import { useActionState, useDeferredValue, useState } from "react";
import {
  addCourseAction,
  removeCourseAction,
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

type Overview = {
  selectedCourses: Course[];
  availableCourses: Course[];
  totalCreditHours: number;
  remainingCreditHours: number;
};

export function CourseManagement({ overview }: { overview: Overview }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const availableCourses = overview.availableCourses.filter((course) => {
    if (!deferredQuery) return true;
    return `${course.code} ${course.nameEn} ${course.nameAr}`
      .toLowerCase()
      .includes(deferredQuery);
  });

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        <Summary label="Selected" value={overview.selectedCourses.length} />
        <Summary
          label="Credit hours"
          value={`${overview.totalCreditHours} / ${MAX_SELECTED_CREDIT_HOURS}`}
        />
        <Summary
          label="Remaining"
          value={`${overview.remainingCreditHours} CH`}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-bold">Selected courses</h2>
        {overview.selectedCourses.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-600">
            You haven&apos;t selected any courses yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {overview.selectedCourses.map((course) => (
              <CourseCard course={course} intent="remove" key={course.id} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">
              {overview.remainingCreditHours} credit hours remaining
            </p>
            <h2 className="mt-1 text-xl font-bold">Available courses</h2>
          </div>
          <label className="w-full sm:w-72">
            <span className="sr-only">Search available courses</span>
            <input
              className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search courses"
              type="search"
              value={query}
            />
          </label>
        </div>

        {availableCourses.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-600">
            {query
              ? "No courses match your search."
              : "No other courses are available."}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {availableCourses.map((course) => (
              <CourseCard
                course={course}
                disabled={course.creditHours > overview.remainingCreditHours}
                intent="add"
                key={course.id}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function CourseCard({
  course,
  intent,
  disabled = false,
}: {
  course: Course;
  intent: "add" | "remove";
  disabled?: boolean;
}) {
  const action = intent === "add" ? addCourseAction : removeCourseAction;
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  } satisfies StudentCourseActionState);

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <strong className="font-mono text-sm text-blue-700">
          {course.code}
        </strong>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
          {course.creditHours} CH
        </span>
      </div>
      <h3 className="mt-4 font-bold">{course.nameEn}</h3>
      <p className="mt-1 text-sm text-slate-500" dir="rtl">
        {course.nameAr}
      </p>

      <form
        action={formAction}
        className="mt-auto pt-5"
        onSubmit={(event) => {
          if (
            intent === "remove" &&
            !window.confirm(
              `Remove ${course.nameEn} from your selected courses?`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input name="courseId" type="hidden" value={course.id} />
        <button
          className={`min-h-11 w-full rounded-lg border px-4 text-sm font-bold disabled:cursor-not-allowed ${
            intent === "remove"
              ? "border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:bg-slate-100 disabled:text-slate-500"
              : "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
          }`}
          disabled={pending || disabled}
          type="submit"
        >
          {pending
            ? intent === "add"
              ? "Adding..."
              : "Removing..."
            : disabled
              ? "Exceeds 19 CH"
              : intent === "add"
                ? "Add Course"
                : "Remove"}
        </button>
        {state.status !== "idle" ? (
          <p
            className={`mt-2 rounded-lg p-2 text-sm ${
              state.status === "error"
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </article>
  );
}

function Summary({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </article>
  );
}
