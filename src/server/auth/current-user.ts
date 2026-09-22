import { getServerSession } from "next-auth";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { authOptions } from "@/server/auth/options";

const currentUserSelect = {
  id: true,
  email: true,
  role: true,
  adminName: true,
  locale: true,
  isActive: true,
  mustChangePassword: true,
  student: {
    select: {
      id: true,
      universityId: true,
      fullName: true,
      completedCreditHours: true,
      isTransferredThisYear: true,
    },
  },
  requestedStudentLinks: {
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} satisfies Prisma.UserSelect;

export type CurrentUser = Prisma.UserGetPayload<{
  select: typeof currentUserSelect;
}>;

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  return db.user.findFirst({
    where: { id: userId, isActive: true },
    select: currentUserSelect,
  });
}

export function currentUserDisplayName(user: CurrentUser) {
  if (user.role === "STUDENT") {
    return user.student?.fullName ?? user.email;
  }
  return user.adminName ? `Dr. ${user.adminName}` : user.email;
}
