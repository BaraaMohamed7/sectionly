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
    redirect(
      user.onboardingCompletedAt ? "/dashboard" : "/register/courses",
    );
  }

  redirect("/admin");
}
