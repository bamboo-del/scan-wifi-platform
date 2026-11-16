import type {
  AdminActor,
  DashboardResponse,
  PaginationResponse,
  OperationLogItem,
  StoreStatisticsResponse,
} from "@scan-wifi/shared-types";
import { badRequest } from "../lib/errors.js";
import { defaultStatisticsRange } from "../lib/time.js";
import type { PlatformRepository } from "../repositories/platform-repository.js";

import { requirePlatformAdmin, requireStoreAccess } from "./access-service.js";

export class StatisticsService {
  public constructor(private readonly repository: PlatformRepository) {}

  public async dashboard(actor: AdminActor, now = new Date()): Promise<DashboardResponse> {
    requirePlatformAdmin(actor);
    const aggregate = await this.repository.getDashboard(
      now,
      actor.role === "operator" ? actor.id : undefined,
    );
    const attempts = aggregate.today.connectSuccesses + aggregate.today.connectFailures;
    return {
      storeTotal: aggregate.storeTotal,
      activeQrCodeTotal: aggregate.activeQrCodeTotal,
      today: {
        pageViews: aggregate.today.pageViews,
        connectClicks: aggregate.today.connectClicks,
        connectSuccesses: aggregate.today.connectSuccesses,
        connectFailures: aggregate.today.connectFailures,
        successRate: attempts === 0 ? 0 : aggregate.today.connectSuccesses / attempts,
      },
      funnel: aggregate.funnel,
      trend: aggregate.trend,
    };
  }

  public async storeStatistics(
    storeId: string,
    actor: AdminActor,
    fromValue?: string,
    toValue?: string,
  ): Promise<StoreStatisticsResponse> {
    await requireStoreAccess(this.repository, storeId, actor);
    requirePlatformAdmin(actor);
    const to = toValue ? new Date(toValue) : new Date();
    const from = fromValue ? new Date(fromValue) : defaultStatisticsRange(to).from;
    if (from >= to) throw badRequest("VALIDATION_ERROR", "from 必须早于 to");
    const result = await this.repository.getStoreStatistics(storeId, from, to);
    const attempts = result.totals.connectSuccesses + result.totals.connectFailures;
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        ...result.totals,
        successRate: attempts === 0 ? 0 : result.totals.connectSuccesses / attempts,
      },
      commonErrors: result.commonErrors,
    };
  }

  public async operationLogs(
    input: {
      page: number;
      pageSize: number;
      search?: string;
      action?: string;
      resourceType?: string;
    },
    actor: AdminActor,
  ): Promise<PaginationResponse<OperationLogItem>> {
    requirePlatformAdmin(actor);
    const result = await this.repository.listOperationLogs(input);
    return {
      items: result.items.map((item) => ({
        id: item.id,
        adminId: item.adminId,
        adminUsername: item.adminUsername,
        action: item.action,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        metadata: item.metadata,
        createdAt: item.createdAt.toISOString(),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize),
    };
  }
}
