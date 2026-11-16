import type { AccountSummary, AdminActor, AdminStatus } from "@scan-wifi/shared-types";
import type { LoginInput } from "@scan-wifi/validation";
import { badRequest, conflict, notFound, unauthorized } from "../lib/errors.js";
import type { AdminRecord, PlatformRepository } from "../repositories/platform-repository.js";
import { accountRole, requirePlatformAdmin, requireStoreAccess } from "./access-service.js";
import type { AuditService } from "./audit-service.js";
import type { PasswordHasher } from "./password-service.js";

function presentAccount(account: AdminRecord, adminUsername: string): AccountSummary {
  return {
    id: account.id,
    username: account.username,
    role: accountRole(account.username, adminUsername),
    status: account.status,
    createdAt: account.createdAt.toISOString(),
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
  };
}

export class AccountService {
  public constructor(
    private readonly repository: PlatformRepository,
    private readonly passwords: PasswordHasher,
    private readonly audit: AuditService,
    private readonly adminUsername: string,
  ) {}

  public async list(actor: AdminActor): Promise<AccountSummary[]> {
    requirePlatformAdmin(actor);
    return (await this.repository.listAccounts()).map((account) =>
      presentAccount(account, this.adminUsername),
    );
  }

  public async create(input: LoginInput, actor: AdminActor): Promise<AccountSummary> {
    requirePlatformAdmin(actor);
    const hash = await this.passwords.hash(input.password);
    return this.repository.transaction(async (repository) => {
      const account = await repository.createOperator(input.username, hash);
      if (!account) throw conflict("USERNAME_EXISTS", "用户名已存在");
      await this.audit.record(
        {
          adminId: actor.id,
          action: "account.create",
          resourceType: "admin",
          resourceId: account.id,
          metadata: { username: account.username, role: "operator" },
        },
        repository,
      );
      return presentAccount(account, this.adminUsername);
    });
  }

  public async update(
    id: string,
    input: { status?: AdminStatus; password?: string },
    actor: AdminActor,
  ): Promise<AccountSummary> {
    requirePlatformAdmin(actor);
    const passwordHash = input.password ? await this.passwords.hash(input.password) : undefined;
    return this.repository.transaction(async (repository) => {
      const current = await repository.lockAccount(id);
      if (!current || accountRole(current.username, this.adminUsername) !== "operator")
        throw notFound("OPERATOR_NOT_FOUND", "同仁账号不存在");
      const account = await repository.updateAccount(id, {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(passwordHash === undefined ? {} : { passwordHash }),
      });
      if (!account) throw notFound("OPERATOR_NOT_FOUND", "同仁账号不存在");
      // Re-enabling does not restore old sessions; reset and disable revoke them atomically.
      await repository.deleteAdminSessions(id);
      await this.audit.record(
        {
          adminId: actor.id,
          action: input.password ? "account.reset_password" : "account.status",
          resourceType: "admin",
          resourceId: id,
          metadata: { status: account.status },
        },
        repository,
      );
      return presentAccount(account, this.adminUsername);
    });
  }

  public async changePassword(
    input: { currentPassword: string; newPassword: string },
    actor: AdminActor,
  ): Promise<void> {
    const current = await this.repository.findAdminById(actor.id);
    if (!current || !(await this.passwords.verify(current.passwordHash, input.currentPassword)))
      throw badRequest("INVALID_CURRENT_PASSWORD", "当前密码错误");
    const previousHash = current.passwordHash;
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.repository.transaction(async (repository) => {
      // Compare again in the update transaction so a concurrent reset cannot be overwritten.
      const account = await repository.lockAccount(actor.id);
      if (!account || account.passwordHash !== previousHash || account.status !== "active")
        throw unauthorized();
      await repository.updateAccount(actor.id, { passwordHash });
      await repository.deleteAdminSessions(actor.id);
      await this.audit.record(
        {
          adminId: actor.id,
          action: "account.change_password",
          resourceType: "admin",
          resourceId: actor.id,
        },
        repository,
      );
    });
  }

  public async transfer(
    storeId: string,
    input: { ownerId: string | null; reason: string },
    actor: AdminActor,
  ): Promise<void> {
    requirePlatformAdmin(actor);
    await this.repository.transaction(async (repository) => {
      const store = await requireStoreAccess(repository, storeId, actor, true);
      if (input.ownerId !== null) {
        const owner = await repository.findAdminById(input.ownerId);
        if (!owner || owner.status !== "active")
          throw conflict("OWNER_UNAVAILABLE", "目标账号不存在或已停用");
      }
      const previousOwnerId = store.ownerId;
      const previousOwner = previousOwnerId
        ? await repository.findAdminById(previousOwnerId)
        : null;
      const nextOwner = input.ownerId ? await repository.findAdminById(input.ownerId) : null;
      await repository.transferStore(storeId, input.ownerId);
      await this.audit.record(
        {
          adminId: actor.id,
          action: "store.transfer",
          resourceType: "store",
          resourceId: storeId,
          metadata: {
            previousOwnerId,
            ownerId: input.ownerId,
            previousOwnerUsername: previousOwner?.username ?? null,
            ownerUsername: nextOwner?.username ?? null,
            reason: input.reason,
          },
        },
        repository,
      );
    });
  }
}
