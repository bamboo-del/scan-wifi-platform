import * as React from "react";
import Activity from "lucide-react/dist/esm/icons/activity";
import CircleX from "lucide-react/dist/esm/icons/circle-x";
import Eye from "lucide-react/dist/esm/icons/eye";
import Megaphone from "lucide-react/dist/esm/icons/megaphone";
import MousePointerClick from "lucide-react/dist/esm/icons/mouse-pointer-click";
import Wifi from "lucide-react/dist/esm/icons/wifi";

import { ResourceError } from "@/components/resource-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatNumber, formatPercent } from "@/lib/format";

const errorLabels: Record<string, string> = {
  wifi_disabled: "Wi-Fi 未开启",
  connect_timeout: "连接超时",
  permission_denied: "权限被拒绝",
  password_error: "密码错误",
  unsupported: "系统不支持",
};

export function StatisticsPanel({ storeId }: { storeId: string }): React.JSX.Element {
  const loader = React.useCallback(() => api.statistics(storeId), [storeId]);
  const { resource, reload } = useAsyncResource(loader);

  if (resource.status === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (resource.status === "error") return <ResourceError error={resource.error} onRetry={reload} />;

  const totals = resource.data.totals;
  const metrics = [
    { label: "页面访问", value: totals.pageViews, icon: Eye },
    { label: "连接点击", value: totals.connectClicks, icon: MousePointerClick },
    { label: "连接成功", value: totals.connectSuccesses, icon: Wifi },
    { label: "连接失败", value: totals.connectFailures, icon: CircleX },
    { label: "广告加载", value: totals.adLoadSuccesses, icon: Megaphone },
    { label: "成功率", value: formatPercent(totals.successRate), icon: Activity },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader>
              <div className="flex flex-col gap-1">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                <CardDescription>
                  {resource.data.range.from} 至 {resource.data.range.to}
                </CardDescription>
              </div>
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5 stroke-[1.75]" aria-hidden="true" />
              </span>
            </CardHeader>
            <CardContent className="pt-3 text-2xl font-semibold">
              {typeof value === "number" ? formatNumber(value) : value}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1.5">
            <CardTitle>常见错误码</CardTitle>
            <CardDescription>仅保存脱敏后的错误分类，不记录顾客身份。</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>错误码</TableHead>
                <TableHead>说明</TableHead>
                <TableHead className="text-right">次数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resource.data.commonErrors.map((item) => (
                <TableRow key={item.errorCode}>
                  <TableCell>
                    <Badge variant="outline">{item.errorCode}</Badge>
                  </TableCell>
                  <TableCell>{errorLabels[item.errorCode] ?? "其他连接错误"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(item.count)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
