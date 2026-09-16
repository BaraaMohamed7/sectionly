import { spawnSync } from "node:child_process";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, env = process.env) {
  const result = spawnSync(npm, args, {
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["exec", "--", "prisma", "migrate", "deploy"], {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
});
run(["exec", "--", "vitest", "run", "tests/integration"]);
