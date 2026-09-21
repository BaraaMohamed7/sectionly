import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function SuperAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.SUPER_ADMIN || user.mustChangePassword) {
    redirect("/admin");
  }

  return children;
}
