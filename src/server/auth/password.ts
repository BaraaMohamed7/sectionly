import { compare, hash } from "bcryptjs";

export const BCRYPT_COST = 12;

export const DUMMY_PASSWORD_HASH =
  "$2b$12$sOS09CirDm7x/t.aj73Sa.93cHIFz6tREAl5oFkrneXoZ8AEQNjra";

export function hashPassword(password: string) {
  return hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}
