import * as React from "react";
import { toast } from "sonner";
import type { WifiNetworkResponse } from "@scan-wifi/shared-types";
import { api } from "@/lib/api";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { PageSkeleton, ResourceError } from "./resource-state";
import { StatusBadge } from "./status-badge";
import { QrCodeCard } from "./qr-code-card";

export function NetworkManager({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}): React.JSX.Element {
  const loader = React.useCallback(() => api.listNetworks(storeId), [storeId]);
  const { resource, reload } = useAsyncResource(loader);
  const [editing, setEditing] = React.useState<WifiNetworkResponse | null>(null);
  const [ssid, setSsid] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [bssid, setBssid] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const reset = (): void => {
    setEditing(null);
    setSsid("");
    setPassword("");
    setBssid("");
  };
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    try {
      await api.saveNetwork(
        storeId,
        {
          ssid: ssid.trim(),
          password,
          bssid: bssid.trim() || null,
          securityType: editing?.securityType ?? "WPA2",
          status: editing?.status ?? "active",
        },
        editing?.id ?? undefined,
      );
      reset();
      reload();
      toast.success("Wi-Fi 已保存，已打印的小程序码继续有效");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setPending(false);
    }
  };
  const toggle = async (network: WifiNetworkResponse): Promise<void> => {
    if (!network.id) return;
    setPending(true);
    try {
      await api.setNetworkStatus(
        storeId,
        network.id,
        network.status === "active" ? "disabled" : "active",
      );
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "更新网络与密码" : "新增 Wi-Fi"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={(event) => void save(event)}>
            <Field>
              <FieldLabel htmlFor="network-ssid">Wi-Fi 名称</FieldLabel>
              <Input
                id="network-ssid"
                required
                maxLength={32}
                value={ssid}
                onChange={(event) => setSsid(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="network-password">
                {editing ? "新密码" : "Wi-Fi 密码"}
              </FieldLabel>
              <Input
                id="network-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={63}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="network-bssid">BSSID（可选）</FieldLabel>
              <Input
                id="network-bssid"
                value={bssid}
                placeholder="AA:BB:CC:DD:EE:FF"
                onChange={(event) => setBssid(event.target.value)}
              />
            </Field>
            <div className="flex gap-2 md:col-span-3">
              <Button type="submit" disabled={pending}>
                {editing ? "保存网络" : "添加网络"}
              </Button>
              {editing ? (
                <Button type="button" variant="outline" onClick={reset}>
                  取消编辑
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
      {resource.status === "loading" ? (
        <PageSkeleton />
      ) : resource.status === "error" ? (
        <ResourceError error={resource.error} onRetry={reload} />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {resource.data.map((network) => (
            <Card key={network.id}>
              <CardHeader>
                <CardTitle>{network.ssid}</CardTitle>
                <StatusBadge status={network.status ?? "disabled"} />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  密码：{network.passwordMasked} · {network.bssid ?? "未限定接入点"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setEditing(network);
                      setSsid(network.ssid ?? "");
                      setBssid(network.bssid ?? "");
                      setPassword("");
                    }}
                  >
                    更新密码 / 编辑
                  </Button>
                  <Button variant="outline" disabled={pending} onClick={() => void toggle(network)}>
                    {network.status === "active" ? "停用网络" : "启用网络"}
                  </Button>
                </div>
                {network.id ? (
                  <QrCodeCard
                    storeId={storeId}
                    storeName={storeName}
                    wifiId={network.id}
                    qrCode={network.qrCode}
                    onChange={reload}
                    compact
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
