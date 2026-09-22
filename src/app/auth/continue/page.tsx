import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function AuthenticationContinuationPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  if (user.role === UserRole.STUDENT) {
    if (!user.student) redirect("/student-link-status");
    if (
      user.student.completedCreditHours === null ||
      user.student.isTransferredThisYear === null
    ) {
      redirect("/complete-profile");
    }
    redirect("/dashboard");
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    redirect("/admin");
  }

  // The regular Admin landing page remains intentionally limited for now.
  redirect("/admin");
}
