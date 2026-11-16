import * as React from "react";
import type { WifiNetworkResponse } from "@scan-wifi/shared-types";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton, ResourceError } from "@/components/resource-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { formatPercent } from "@/lib/format";

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export default function AnalyticsPage(): React.JSX.Element {
  const [merchantId, setMerchantId] = React.useState("");
  const [storeId, setStoreId] = React.useState("");
  const [wifiId, setWifiId] = React.useState("");
  const [networks, setNetworks] = React.useState<WifiNetworkResponse[]>([]);
  const [from, setFrom] = React.useState(() =>
    new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = React.useState({
    from: `${from}T00:00:00.000Z`,
    to: new Date(Date.parse(`${to}T00:00:00.000Z`) + 86400000).toISOString(),
  });
  const choices = React.useCallback(async () => {
    const merchants = await api.listMerchants();
    const stores = [] as Awaited<ReturnType<typeof api.listStores>>["items"];
    let page = 1,
      totalPages: number;
    do {
      const result = await api.listStores({ page, pageSize: 100 });
      stores.push(...result.items);
      totalPages = result.totalPages;
      page++;
    } while (page <= totalPages);
    return { merchants, stores };
  }, []);
  const options = useAsyncResource(choices);
  const loader = React.useCallback(() => api.analytics(query), [query]);
  const { resource, reload } = useAsyncResource(loader);
  React.useEffect(() => {
    let active = true;
    setNetworks([]);
    if (storeId)
      void api
        .listNetworks(storeId)
        .then((rows) => {
          if (active) setNetworks(rows);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [storeId]);
  const apply = (event: React.FormEvent): void => {
    event.preventDefault();
    setQuery({
      from: `${from}T00:00:00.000Z`,
      to: new Date(Date.parse(`${to}T00:00:00.000Z`) + 86400000).toISOString(),
      ...(merchantId ? { merchantId } : {}),
      ...(storeId ? { storeId } : {}),
      ...(wifiId ? { wifiId } : {}),
    });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="连接统计"
        description="按商户、门店、Wi-Fi 和日期查看。UV 为每日匿名访问标识去重；成功率为成功连接数 / 点击连接数。"
      />
      <Card>
        <CardContent className="pt-6">
          <form className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={apply}>
            <Field>
              <FieldLabel htmlFor="analytics-merchant">商户</FieldLabel>
              <select
                id="analytics-merchant"
                className={selectClass}
                value={merchantId}
                onChange={(event) => {
                  setMerchantId(event.target.value);
                  setStoreId("");
                  setWifiId("");
                }}
              >
                <option value="">全部商户</option>
                {options.resource.status === "success"
                  ? options.resource.data.merchants.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))
                  : null}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="analytics-store">门店</FieldLabel>
              <select
                id="analytics-store"
                className={selectClass}
                value={storeId}
                onChange={(event) => {
                  setStoreId(event.target.value);
                  setWifiId("");
                }}
              >
                <option value="">全部门店</option>
                {options.resource.status === "success"
                  ? options.resource.data.stores
                      .filter((item) => !merchantId || item.merchantId === merchantId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))
                  : null}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="analytics-wifi">Wi-Fi</FieldLabel>
              <select
                id="analytics-wifi"
                className={selectClass}
                value={wifiId}
                disabled={!storeId}
                onChange={(event) => setWifiId(event.target.value)}
              >
                <option value="">全部网络</option>
                {networks.map((item) => (
                  <option key={item.id} value={item.id ?? ""}>
                    {item.ssid}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="analytics-from">开始日期（UTC）</FieldLabel>
              <Input
                id="analytics-from"
                type="date"
                required
                max={to}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="analytics-to">结束日期（UTC）</FieldLabel>
              <Input
                id="analytics-to"
                type="date"
                required
                min={from}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
            <Button type="submit">查询统计</Button>
          </form>
        </CardContent>
      </Card>
      {options.resource.status === "error" ? (
        <ResourceError error={options.resource.error} onRetry={options.reload} />
      ) : null}
      {resource.status === "loading" ? (
        <PageSkeleton />
      ) : resource.status === "error" ? (
        <ResourceError error={resource.error} onRetry={reload} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "日期",
                    "门店",
                    "Wi-Fi",
                    "PV",
                    "UV",
                    "扫码",
                    "连接点击",
                    "成功",
                    "失败",
                    "复制密码",
                    "成功率",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {resource.data.map((row) => (
                  <TableRow key={`${row.date}-${row.storeId}-${row.wifiId}`}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>
                      {options.resource.status === "success"
                        ? (options.resource.data.stores.find((item) => item.id === row.storeId)
                            ?.name ?? "门店")
                        : "门店"}
                    </TableCell>
                    <TableCell>{row.ssid ?? "历史网络"}</TableCell>
                    {[
                      row.totals.pageViews,
                      row.totals.uniqueVisitors,
                      row.totals.scans,
                      row.totals.connectClicks,
                      row.totals.connectSuccesses,
                      row.totals.connectFailures,
                      row.totals.passwordCopies,
                    ].map((value, i) => (
                      <TableCell key={i}>{value}</TableCell>
                    ))}
                    <TableCell>{formatPercent(row.totals.successRate)}</TableCell>
                  </TableRow>
                ))}
                {resource.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-12 text-center text-muted-foreground">
                      所选时间暂无连接事件
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
