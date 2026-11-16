import { NetworkManager } from "@/components/network-manager";
import * as React from "react";
import Activity from "lucide-react/dist/esm/icons/activity";
import MapPin from "lucide-react/dist/esm/icons/map-pin";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Phone from "lucide-react/dist/esm/icons/phone";
import Store from "lucide-react/dist/esm/icons/store";
import UserRound from "lucide-react/dist/esm/icons/user-round";
import Wifi from "lucide-react/dist/esm/icons/wifi";
import { Link, useParams } from "react-router";

import { PageHeader } from "@/components/page-header";
import { QrCodeCard } from "@/components/qr-code-card";
import { PageSkeleton, ResourceError } from "@/components/resource-state";
import { StatisticsPanel } from "@/components/statistics-panel";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { formatWifiSecurityType } from "@/lib/wifi-security";

export default function StoreDetailPage(): React.JSX.Element {
  const { id = "" } = useParams<{ id: string }>();
  const loader = React.useCallback(() => api.getStore(id), [id]);
  const { resource, reload } = useAsyncResource(loader);
  const [localQrCode, setLocalQrCode] =
    React.useState<Awaited<ReturnType<typeof api.getQrCode>>>(null);

  React.useEffect(() => {
    if (resource.status === "success") setLocalQrCode(resource.data.qrCode);
  }, [resource]);

  if (resource.status === "loading") return <PageSkeleton />;
  if (resource.status === "error") return <ResourceError error={resource.error} onRetry={reload} />;

  const store = resource.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={store.name}
        breadcrumbs={[{ label: "门店管理", href: "/stores" }, { label: store.name }]}
        actions={
          <Button asChild>
            <Link to={`/stores/${store.id}/edit`}>
              <Pencil data-icon="inline-start" />
              编辑门店
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={store.status} />
        <Badge variant={store.adEnabled ? "success" : "secondary"}>
          广告{store.adEnabled ? "已开启" : "已关闭"}
        </Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">门店概览</TabsTrigger>
          <TabsTrigger value="networks">Wi-Fi 管理</TabsTrigger>
          <TabsTrigger value="qrcode">二维码</TabsTrigger>
          <TabsTrigger value="statistics">统计</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-1.5">
                  <CardTitle>门店资料</CardTitle>
                  <CardDescription>平台管理员维护的基础资料。</CardDescription>
                </div>
                <Store className="size-5 text-primary" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <dl className="grid gap-5 text-sm md:grid-cols-2">
                  <InfoRow icon={MapPin} label="地址" value={store.address} />
                  <InfoRow icon={UserRound} label="联系人" value={store.contactName} />
                  <InfoRow icon={Phone} label="联系电话" value={store.contactPhone} />
                  <InfoRow
                    icon={Activity}
                    label="更新时间"
                    value={formatDateTime(store.updatedAt)}
                  />
                  <div className="md:col-span-2">
                    <InfoRow icon={Store} label="备注" value={store.notes} />
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-1.5">
                  <CardTitle>Wi-Fi 状态</CardTitle>
                  <CardDescription>密码仅显示固定掩码。</CardDescription>
                </div>
                <Wifi className="size-5 text-primary" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                {store.wifi.configured ? (
                  <dl className="grid gap-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">SSID</dt>
                      <dd className="font-medium">{store.wifi.ssid ?? "—"}</dd>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">密码</dt>
                      <dd>{store.wifi.passwordMasked ?? "—"}</dd>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">BSSID</dt>
                      <dd>{store.wifi.bssid ?? "—"}</dd>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">安全类型</dt>
                      <dd>{formatWifiSecurityType(store.wifi.securityType)}</dd>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">版本</dt>
                      <dd>v{store.wifi.version ?? 0}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">尚未配置 Wi-Fi。</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="networks">
          <NetworkManager storeId={store.id} storeName={store.name} />
        </TabsContent>
        <TabsContent value="qrcode">
          <div className="max-w-2xl">
            <QrCodeCard
              storeId={store.id}
              storeName={store.name}
              qrCode={localQrCode}
              onChange={setLocalQrCode}
            />
          </div>
        </TabsContent>
        <TabsContent value="statistics">
          <StatisticsPanel storeId={store.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string | null;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words font-medium">{value ?? "—"}</dd>
      </div>
    </div>
  );
}
