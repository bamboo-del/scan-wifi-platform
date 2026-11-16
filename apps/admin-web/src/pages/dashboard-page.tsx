import * as React from "react";
import Activity from "lucide-react/dist/esm/icons/activity";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days";
import CircleCheckBig from "lucide-react/dist/esm/icons/circle-check-big";
import QrCode from "lucide-react/dist/esm/icons/qr-code";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import ScanLine from "lucide-react/dist/esm/icons/scan-line";
import UserRound from "lucide-react/dist/esm/icons/user-round";
import Wifi from "lucide-react/dist/esm/icons/wifi";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { ResourceEmpty, ResourceError, TableSkeleton } from "@/components/resource-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, formatPercent, formatShortDate } from "@/lib/format";
import type { StoreStatus } from "@/lib/types";

type DashboardBundle = Awaited<ReturnType<typeof loadDashboard>>;

async function loadDashboard(status: StoreStatus | "all"): Promise<{
  dashboard: Awaited<ReturnType<typeof api.dashboard>>;
  stores: Awaited<ReturnType<typeof api.listStores>>;
}> {
  const [dashboard, stores] = await Promise.all([
    api.dashboard(),
    api.listStores({ page: 1, pageSize: 10, status }),
  ]);
  return { dashboard, stores };
}

function MetricCard({
  label,
  value,
  icon: Icon,
  helper,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  helper: string;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <CardDescription>{helper}</CardDescription>
        </div>
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5 stroke-[1.75]" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="pt-2">
        <strong className="text-3xl font-semibold tracking-tight">{value}</strong>
      </CardContent>
    </Card>
  );
}

function DashboardLoading(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,0.9fr)]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
      <TableSkeleton rows={3} />
    </div>
  );
}

export default function DashboardPage(): React.JSX.Element {
  const [status, setStatus] = React.useState<StoreStatus | "all">("all");
  const [dateRange, setDateRange] = React.useState<"7" | "30" | "all">("7");
  const loader = React.useCallback(() => loadDashboard(status), [status]);
  const { resource, reload } = useAsyncResource<DashboardBundle>(loader);

  const recentStores = React.useMemo(() => {
    if (resource.status !== "success") return [];
    if (dateRange === "all") return resource.data.stores.items;
    const threshold = Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;
    return resource.data.stores.items.filter(
      (store) => new Date(store.updatedAt).getTime() >= threshold,
    );
  }, [dateRange, resource]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="仪表盘"
        description="查看用户服务状态、今日连接表现和近 7 天匿名事件趋势。"
        actions={
          <Button variant="outline" onClick={reload} disabled={resource.status === "loading"}>
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      {resource.status === "loading" ? <DashboardLoading /> : null}
      {resource.status === "error" ? (
        <ResourceError error={resource.error} onRetry={reload} />
      ) : null}
      {resource.status === "success" ? (
        <DashboardContent
          data={resource.data}
          recentStores={recentStores}
          status={status}
          dateRange={dateRange}
          onStatusChange={setStatus}
          onDateRangeChange={setDateRange}
        />
      ) : null}
    </div>
  );
}

function DashboardContent({
  data,
  recentStores,
  status,
  dateRange,
  onStatusChange,
  onDateRangeChange,
}: {
  data: DashboardBundle;
  recentStores: DashboardBundle["stores"]["items"];
  status: StoreStatus | "all";
  dateRange: "7" | "30" | "all";
  onStatusChange: (value: StoreStatus | "all") => void;
  onDateRangeChange: (value: "7" | "30" | "all") => void;
}): React.JSX.Element {
  const metrics = [
    {
      label: "用户总数",
      value: formatNumber(data.dashboard.storeTotal),
      icon: UserRound,
      helper: "当前账号可管理的用户",
    },
    {
      label: "启用二维码",
      value: formatNumber(data.dashboard.activeQrCodeTotal),
      icon: QrCode,
      helper: "当前可用",
    },
    {
      label: "今日扫码量",
      value: formatNumber(data.dashboard.today.pageViews),
      icon: ScanLine,
      helper: "匿名页面访问",
    },
    {
      label: "今日连接成功",
      value: formatNumber(data.dashboard.today.connectSuccesses),
      icon: Wifi,
      helper: "已完成连接",
    },
    {
      label: "今日成功率",
      value: formatPercent(data.dashboard.today.successRate),
      icon: Activity,
      helper: "成功 /（成功 + 失败）",
    },
  ] as const;

  const funnelMax = Math.max(data.dashboard.funnel.pageViews, 1);
  const funnelItems = [
    { label: "页面访问", value: data.dashboard.funnel.pageViews, color: "bg-chart-1/18" },
    { label: "连接点击", value: data.dashboard.funnel.connectClicks, color: "bg-chart-2/35" },
    { label: "连接成功", value: data.dashboard.funnel.connectSuccesses, color: "bg-chart-3/55" },
    { label: "连接失败", value: data.dashboard.funnel.connectFailures, color: "bg-destructive/12" },
  ] as const;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="关键指标">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,0.9fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5">
              <CardTitle>近 7 天连接趋势</CardTitle>
              <CardDescription>UTC 自然日聚合，前端按本地时区展示。</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-84 pt-3">
            {data.dashboard.trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.dashboard.trend}
                  margin={{ top: 12, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatShortDate}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={60} />
                  <Tooltip labelFormatter={(label) => String(label)} />
                  <Legend iconType="circle" iconSize={7} />
                  <Line
                    name="页面访问"
                    dataKey="pageViews"
                    type="monotone"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    name="连接点击"
                    dataKey="connectClicks"
                    type="monotone"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    name="连接成功"
                    dataKey="connectSuccesses"
                    type="monotone"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResourceEmpty
                title="暂无趋势数据"
                description="事件汇总完成后，这里会显示最近 7 天趋势。"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5">
              <CardTitle>连接漏斗</CardTitle>
              <CardDescription>近 7 天关键连接步骤</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-3">
            {funnelItems.map((item, index) => (
              <div key={item.label} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">
                    {formatNumber(item.value)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {formatPercent(item.value / funnelMax)}
                    </span>
                  </span>
                </div>
                <div className="h-10 overflow-hidden rounded-md bg-muted">
                  <div
                    className={`h-full ${item.color} transition-[width] duration-500`}
                    style={{ width: `${Math.max((item.value / funnelMax) * 100, 7)}%` }}
                    aria-hidden="true"
                  />
                </div>
                {index < funnelItems.length - 1 ? (
                  <div className="mx-auto h-2 w-px bg-border" aria-hidden="true" />
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1.5">
            <CardTitle>近期用户</CardTitle>
            <CardDescription>按更新时间和服务状态筛选。</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select
              value={dateRange}
              onValueChange={(value) => onDateRangeChange(value as "7" | "30" | "all")}
            >
              <SelectTrigger className="sm:w-44" aria-label="更新时间范围">
                <CalendarDays className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="7">最近 7 天</SelectItem>
                  <SelectItem value="30">最近 30 天</SelectItem>
                  <SelectItem value="all">全部时间</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => onStatusChange(value as StoreStatus | "all")}
            >
              <SelectTrigger className="sm:w-36" aria-label="用户状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="disabled">停用</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {recentStores.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>Wi-Fi</TableHead>
                  <TableHead>二维码</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentStores.slice(0, 5).map((store) => (
                  <TableRow key={store.id}>
                    <TableCell>
                      <div className="flex min-w-48 flex-col gap-1">
                        <span className="font-medium">{store.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {store.address ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={store.status} />
                    </TableCell>
                    <TableCell>
                      {store.hasWifi ? (
                        <CircleCheckBig className="size-4 text-success" aria-label="已配置" />
                      ) : (
                        "未配置"
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={store.qrCodeStatus} />
                    </TableCell>
                    <TableCell>{formatDateTime(store.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/stores/${store.id}`}>查看详情</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <ResourceEmpty
              title="没有符合条件的用户"
              description="调整日期范围或状态筛选后再试。"
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
