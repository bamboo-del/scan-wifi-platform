import type { AdminActor, AdminRole } from "@scan-wifi/shared-types";
import { forbidden, notFound } from "../lib/errors.js";
import type { PlatformRepository, StoreRecord } from "../repositories/platform-repository.js";

export function accountRole(username: string, adminUsername: string): AdminRole {
  return username.toLowerCase() === adminUsername.toLowerCase() ? "admin" : "operator";
}

export function requirePlatformAdmin(actor: AdminActor): void {
  if (actor.role !== "admin") throw forbidden();
}

export async function requireStoreAccess(
  repository: PlatformRepository,
  storeId: string,
  actor: AdminActor,
  lock = false,
): Promise<StoreRecord> {
  const store = await repository.getStore(storeId, lock);
  if (!store || (actor.role !== "admin" && store.ownerId !== actor.id)) {
    throw notFound("STORE_NOT_FOUND", "用户不存在或无权访问");
  }
  return store;
}
