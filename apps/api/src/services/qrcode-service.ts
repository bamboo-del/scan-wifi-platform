import type { AdminActor, QrCodeResponse } from "@scan-wifi/shared-types";
import { forbidden, notFound } from "../lib/errors.js";
import type { PlatformRepository, QrCodeRecord } from "../repositories/platform-repository.js";
import { requirePlatformAdmin, requireStoreAccess } from "./access-service.js";
import type { AuditService } from "./audit-service.js";
import { presentQrCode } from "./presenters.js";
import type { QrCodeProvider } from "./qrcode-provider.js";
import type { QrCodeStorage } from "./qrcode-storage.js";
import { createSceneToken } from "./scene-token.js";

export class QrCodeService {
  public constructor(
    private readonly repository: PlatformRepository,
    private readonly provider: QrCodeProvider,
    private readonly storage: QrCodeStorage,
    private readonly audit: AuditService,
  ) {}

  public async generate(storeId: string, actor: AdminActor): Promise<QrCodeResponse> {
    await requireStoreAccess(this.repository, storeId, actor);
    if (actor.role === "operator" && (await this.repository.getLatestQrForStore(storeId)))
      throw forbidden("已有二维码，请联系主账号管理");
    const sceneToken = createSceneToken();
    const generated = await this.provider.generate(sceneToken);
    const stored = await this.storage.save(sceneToken, generated.extension, generated.content);
    return this.repository.transaction(async (repository) => {
      await requireStoreAccess(repository, storeId, actor, true);
      if (actor.role === "operator" && (await repository.getLatestQrForStore(storeId)))
        throw forbidden("已有二维码，请联系主账号管理");
      const qrCode = await repository.replaceActiveQr({
        storeId,
        sceneToken,
        imageUrl: stored.location,
        provider: this.provider.kind,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: "qrcode.generate",
          resourceType: "qr_code",
          resourceId: qrCode.id,
          metadata: { storeId, provider: qrCode.provider },
        },
        repository,
      );
      return presentQrCode((await repository.getQrById(qrCode.id)) ?? qrCode);
    });
  }

  public async getForStore(storeId: string, actor: AdminActor): Promise<QrCodeResponse> {
    await requireStoreAccess(this.repository, storeId, actor);
    const qrCode = await this.repository.getLatestQrForStore(storeId);
    if (!qrCode) throw notFound("QR_CODE_NOT_FOUND", "该用户尚未生成小程序码");
    return presentQrCode(qrCode);
  }

  public async setStatus(
    id: string,
    status: "active" | "disabled",
    actor: AdminActor,
  ): Promise<QrCodeResponse> {
    return this.repository.transaction(async (repository) => {
      const current = await this.requireQr(id, repository);
      await requireStoreAccess(repository, current.storeId, actor, true);
      requirePlatformAdmin(actor);
      const updated = await repository.setQrStatus(id, status, new Date());
      if (!updated) throw notFound("QR_CODE_NOT_FOUND", "小程序码不存在");
      await this.audit.record(
        {
          adminId: actor.id,
          action: status === "active" ? "qrcode.enable" : "qrcode.disable",
          resourceType: "qr_code",
          resourceId: id,
          metadata: { storeId: current.storeId, status },
        },
        repository,
      );
      return presentQrCode((await repository.getQrById(id)) ?? updated);
    });
  }

  public async readImage(
    id: string,
    actor: AdminActor,
  ): Promise<{
    qrCode: QrCodeRecord;
    content: Buffer;
    contentType: "image/png" | "image/jpeg" | "image/svg+xml";
  }> {
    const qrCode = await this.requireQr(id);
    await requireStoreAccess(this.repository, qrCode.storeId, actor);
    const image = await this.storage.read(qrCode.imageUrl);
    return { qrCode, ...image };
  }

  private async requireQr(
    id: string,
    repository: PlatformRepository = this.repository,
  ): Promise<QrCodeRecord> {
    const qrCode = await repository.getQrById(id);
    if (!qrCode) throw notFound("QR_CODE_NOT_FOUND", "小程序码不存在");
    return qrCode;
  }
}
