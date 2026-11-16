import { createHmac, randomBytes } from "node:crypto";
import type { AdminSessionResponse } from "@scan-wifi/shared-types";
import type { LoginInput } from "@scan-wifi/validation";
import { unauthorized } from "../lib/errors.js";
import type { PlatformRepository, SessionRecord } from "../repositories/platform-repository.js";
import { accountRole } from "./access-service.js";
import type { AuditService } from "./audit-service.js";
import type { LoginThrottle } from "./login-throttle.js";
import type { PasswordHasher } from "./password-service.js";

export interface AuthenticatedSession {
  cookieValue: string;
  response: AdminSessionResponse;
}

export class AuthService {
  public constructor(
    private readonly repository: PlatformRepository,
    private readonly passwords: PasswordHasher,
    private readonly audit: AuditService,
    private readonly throttle: LoginThrottle,
    private readonly sessionSecret: string,
    private readonly ttlHours: number,
    private readonly adminUsername: string,
  ) {}

  public async login(input: LoginInput, throttleKey: string): Promise<AuthenticatedSession> {
    this.throttle.assertAllowed(throttleKey);
    const admin = await this.repository.findAdminByUsername(input.username);
    const passwordValid = admin
      ? await this.passwords.verify(admin.passwordHash, input.password)
      : await this.consumeEquivalentPasswordWork(input.password);
    if (!admin || admin.status !== "active" || !passwordValid) {
      this.throttle.recordFailure(throttleKey);
      throw unauthorized("用户名或密码错误");
    }

    this.throttle.clear(throttleKey);
    const cookieValue = randomBytes(32).toString("base64url");
    const tokenHash = this.hashSessionToken(cookieValue);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 60 * 60_000);
    await this.repository.transaction(async (repository) => {
      await repository.createSession(tokenHash, admin.id, expiresAt);
      await repository.updateAdminLastLogin(admin.id, now);
      await repository.deleteExpiredSessions(now);
      await this.audit.record(
        {
          adminId: admin.id,
          action: "admin.login",
          resourceType: "admin",
          resourceId: admin.id,
        },
        repository,
      );
    });
    return {
      cookieValue,
      response: {
        authenticated: true,
        admin: {
          id: admin.id,
          username: admin.username,
          role: accountRole(admin.username, this.adminUsername),
        },
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  public async authenticate(cookieValue: string | undefined): Promise<SessionRecord> {
    if (!cookieValue || cookieValue.length < 32 || cookieValue.length > 128) throw unauthorized();
    const session = await this.repository.findSession(
      this.hashSessionToken(cookieValue),
      new Date(),
    );
    if (!session || session.adminStatus !== "active") throw unauthorized();
    return { ...session, adminRole: accountRole(session.adminUsername, this.adminUsername) };
  }

  public async logout(cookieValue: string | undefined, adminId: string | null): Promise<void> {
    if (!cookieValue && !adminId) return;
    await this.repository.transaction(async (repository) => {
      if (cookieValue) await repository.deleteSession(this.hashSessionToken(cookieValue));
      if (adminId) {
        await this.audit.record(
          {
            adminId,
            action: "admin.logout",
            resourceType: "admin",
            resourceId: adminId,
          },
          repository,
        );
      }
    });
  }

  public toResponse(session: SessionRecord): AdminSessionResponse {
    return {
      authenticated: true,
      admin: {
        id: session.adminId,
        username: session.adminUsername,
        role: accountRole(session.adminUsername, this.adminUsername),
      },
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  private hashSessionToken(token: string): string {
    return createHmac("sha256", this.sessionSecret).update(token, "utf8").digest("hex");
  }

  private async consumeEquivalentPasswordWork(password: string): Promise<false> {
    await this.passwords.hash(password);
    return false;
  }
}
