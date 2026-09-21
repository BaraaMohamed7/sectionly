import { bootstrapInitialSuperAdmin } from "../src/server/super-admin/bootstrap";
import { db } from "../src/server/db";

async function main() {
  const fullName = process.env.BOOTSTRAP_SUPER_ADMIN_NAME;
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;

  if (!fullName || !email) {
    throw new Error(
      "Set BOOTSTRAP_SUPER_ADMIN_NAME and BOOTSTRAP_SUPER_ADMIN_EMAIL",
    );
  }

  const result = await bootstrapInitialSuperAdmin({ fullName, email });

  console.log(`Created Super Admin: ${result.superAdmin.email}`);
  console.log(`Temporary password: ${result.temporaryPassword}`);
  console.log("Store it securely. It will not be displayed again.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
