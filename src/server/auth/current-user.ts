import { getServerSession } from "next-auth";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { authOptions } from "@/server/auth/options";

const currentUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  universityId: true,
  completedCreditHours: true,
  isTransferredThisYear: true,
  locale: true,
  isActive: true,
  mustChangePassword: true,
  onboardingCompletedAt: true,
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
