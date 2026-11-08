import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const COST = 12;
export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Used to keep login timing similar when the account does not exist.
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= bcrypt.hash("not-a-real-password", COST));

export function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(14);
  let out = "";
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i] % alphabet.length];
  return out + "7a"; // guarantees a digit + letter
}

export const randomToken = () => crypto.randomBytes(32).toString("base64url");
export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
