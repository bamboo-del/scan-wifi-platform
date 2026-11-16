import { randomBytes } from "node:crypto";

export function createSceneToken(): string {
  return randomBytes(16).toString("hex");
}
