import { randomBytes } from "node:crypto";

export function generateTemporaryPassword() {
  return randomBytes(18).toString("base64url");
}
