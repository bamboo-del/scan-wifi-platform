import type { AnalyticsQuery } from "@scan-wifi/validation";
import type {
  DashboardResponse,
  PaginationResponse,
  OperationLogItem,
  StoreStatisticsResponse,
} from "@scan-wifi/shared-types";
import { notFound } from "../lib/errors.js";
import { defaultStatisticsRange } from "../lib/time.js";
import type { PlatformRepository } from "../repositories/platform-repository.js";

export class StatisticsService {
  public constructor(private readonly repository: PlatformRepository) {}

  public async analytics(input: AnalyticsQuery) {
    return this.repository.getAnalytics(input);
  }

  public async dashboard(now = new Date()): Promise<DashboardResponse> {
    const aggregate = await this.repository.getDashboard(now);
    const attempts = aggregate.today.connectClicks;
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
    fromValue?: string,
    toValue?: string,
  ): Promise<StoreStatisticsResponse> {
    if (!(await this.repository.getStore(storeId))) throw notFound("STORE_NOT_FOUND", "门店不存在");
    const defaults = defaultStatisticsRange(new Date());
    const from = fromValue ? new Date(fromValue) : defaults.from;
    const to = toValue ? new Date(toValue) : defaults.to;
    const result = await this.repository.getStoreStatistics(storeId, from, to);
    const attempts = result.totals.connectClicks;
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        ...result.totals,
        successRate: attempts === 0 ? 0 : result.totals.connectSuccesses / attempts,
      },
      commonErrors: result.commonErrors,
    };
  }

  public async operationLogs(input: {
    page: number;
    pageSize: number;
    search?: string;
    action?: string;
    resourceType?: string;
  }): Promise<PaginationResponse<OperationLogItem>> {
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
