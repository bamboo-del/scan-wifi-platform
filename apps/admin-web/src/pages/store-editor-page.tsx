import * as React from "react";
import { useAuth } from "@/auth/auth-context";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import CircleCheck from "lucide-react/dist/esm/icons/circle-check";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import KeyRound from "lucide-react/dist/esm/icons/key-round";
import MapPin from "lucide-react/dist/esm/icons/map-pin";
import PauseCircle from "lucide-react/dist/esm/icons/pause-circle";
import PlayCircle from "lucide-react/dist/esm/icons/play-circle";
import Save from "lucide-react/dist/esm/icons/save";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import UserRound from "lucide-react/dist/esm/icons/user-round";
import Wifi from "lucide-react/dist/esm/icons/wifi";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
import { QrCodeCard } from "@/components/qr-code-card";
import { PageSkeleton, ResourceError } from "@/components/resource-state";
import { StatisticsPanel } from "@/components/statistics-panel";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  hasValidationErrors,
  type StoreDraft,
  type StoreDraftErrors,
  validateStoreDraft,
} from "@/lib/store-validation";
import type { QrCodeResponse, StoreDetail, StorePayload } from "@/lib/types";
import {
  formatWifiSecurityType,
  isEditableWifiSecurityType,
  toEditableWifiSecurityType,
  WIFI_SECURITY_TYPE_OPTIONS,
} from "@/lib/wifi-security";

const EMPTY_DRAFT: StoreDraft = {
  name: "",
  shortName: "",
  logoUrl: "",
  address: "",
  contactName: "",
  contactPhone: "",
  adEnabled: true,
  status: "active",
  ssid: "",
  bssid: "",
  securityType: "WPA2_WPA3",
  wifiStatus: "active",
  newPassword: "",
  confirmPassword: "",
};

interface EditorBundle {
  store: StoreDetail | null;
}

function toDraft(store: StoreDetail | null): StoreDraft {
  if (!store) return { ...EMPTY_DRAFT };
  return {
    name: store.name,
    shortName: store.shortName ?? "",
    logoUrl: store.logoUrl ?? "",
    address: store.address ?? "",
    contactName: store.contactName ?? "",
    contactPhone: store.contactPhone ?? "",
    adEnabled: store.adEnabled,
    status: store.status,
    ssid: store.wifi.ssid ?? "",
    bssid: store.wifi.bssid ?? "",
    securityType: toEditableWifiSecurityType(store.wifi.securityType),
    wifiStatus: store.wifi.status ?? "active",
    newPassword: "",
    confirmPassword: "",
  };
}

function toStorePayload(draft: StoreDraft): StorePayload {
  return {
    name: draft.name.trim(),
    shortName: draft.shortName.trim() || null,
    logoUrl: draft.logoUrl.trim() || null,
    address: draft.address.trim() || null,
    contactName: draft.contactName.trim() || null,
    contactPhone: draft.contactPhone.trim() || null,
    adEnabled: draft.adEnabled,
    status: draft.status,
  };
}

export default function StoreEditorPage(): React.JSX.Element {
  const { admin } = useAuth();
  const isAdmin = admin?.role === "admin";
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const [draft, setDraft] = React.useState<StoreDraft>({ ...EMPTY_DRAFT });
  const [errors, setErrors] = React.useState<StoreDraftErrors>({});
  const [passwordEditing, setPasswordEditing] = React.useState(isNew);
  const [pending, setPending] = React.useState(false);
  const [qrCode, setQrCode] = React.useState<QrCodeResponse | null>(null);

  const loader = React.useCallback(async (): Promise<EditorBundle> => {
    const store = id ? await api.getStore(id) : null;
    return { store };
  }, [id]);
  const { resource, reload } = useAsyncResource(loader);

  React.useEffect(() => {
    if (resource.status !== "success") return;
    setDraft(toDraft(resource.data.store));
    setQrCode(resource.data.store?.qrCode ?? null);
    setPasswordEditing(isNew || !resource.data.store?.wifi.configured);
    setErrors({});
  }, [isNew, resource]);

  if (resource.status === "loading") return <PageSkeleton />;
  if (resource.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={isNew ? "新建用户" : "编辑用户"} />
        <ResourceError error={resource.error} onRetry={reload} />
      </div>
    );
  }

  const store = resource.data.store;
  if (
    !isAdmin &&
    store &&
    (store.wifi.configured || store.createdById !== admin?.id || store.status !== "active")
  )
    return <Navigate to={`/stores/${store.id}`} replace />;
  const initialDraft = toDraft(store);
  const wifiConfigurationChanged =
    draft.ssid !== initialDraft.ssid ||
    draft.bssid !== initialDraft.bssid ||
    draft.securityType !== initialDraft.securityType ||
    draft.wifiStatus !== initialDraft.wifiStatus;

  const update = <Key extends keyof StoreDraft>(key: Key, value: StoreDraft[Key]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const saveStore = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const requiresPassword =
      isNew || passwordEditing || wifiConfigurationChanged || !store?.wifi.configured;
    const nextErrors = validateStoreDraft(draft, { requireWifiPassword: requiresPassword });
    setErrors(nextErrors);
    if (hasValidationErrors(nextErrors)) {
      toast.error("请检查表单中的错误");
      return;
    }

    setPending(true);
    try {
      if (isNew) {
        const created = await api.createStore({
          ...toStorePayload(draft),
          ...(!isAdmin ? { status: "active", adEnabled: false } : {}),
        });
        try {
          await api.updateWifi(created.id, {
            ssid: draft.ssid,
            password: draft.newPassword,
            ...(draft.bssid.trim() ? { bssid: draft.bssid.trim() } : {}),
            securityType: draft.securityType,
            status: draft.wifiStatus,
          });
        } catch {
          toast.error("用户已创建，但 Wi-Fi 配置失败，请在编辑页重试");
          void navigate(`/stores/${created.id}/edit`, { replace: true });
          return;
        }
        toast.success("用户已创建");
        void navigate(`/stores/${created.id}${isAdmin ? "/edit" : ""}`, { replace: true });
      } else if (store) {
        if (isAdmin) await api.updateStore(store.id, toStorePayload(draft));
        if (requiresPassword) {
          try {
            await api.updateWifi(store.id, {
              ssid: draft.ssid,
              password: draft.newPassword,
              ...(draft.bssid.trim() ? { bssid: draft.bssid.trim() } : {}),
              securityType: draft.securityType,
              status: draft.wifiStatus,
            });
          } catch (error) {
            toast.error(
              `${isAdmin ? "用户资料已保存，但 " : ""}Wi-Fi 配置失败：${error instanceof Error ? error.message : "请重试"}`,
            );
            return;
          }
        }
        if (!isAdmin) {
          toast.success("初始 Wi-Fi 已配置");
          void navigate(`/stores/${store.id}`, { replace: true });
          return;
        }
        toast.success("更改已保存");
        setPasswordEditing(false);
        reload();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  };

  const toggleStoreStatus = async (): Promise<void> => {
    if (!store) return;
    setPending(true);
    try {
      const updated = await api.setStoreStatus(
        store.id,
        store.status === "active" ? "disabled" : "active",
      );
      update("status", updated.status);
      toast.success(updated.status === "active" ? "用户已启用" : "用户已停用");
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      id="store-editor-form"
      className="flex flex-col gap-6"
      onSubmit={(event) => void saveStore(event)}
      noValidate
    >
      <PageHeader
        title={isNew ? "新建用户" : (store?.name ?? "编辑用户")}
        breadcrumbs={[
          { label: "用户管理", href: "/stores" },
          { label: isNew ? "新建用户" : (store?.name ?? "编辑用户") },
        ]}
        actions={
          <>
            <Button type="button" variant="outline" asChild>
              <Link to={store ? `/stores/${store.id}` : "/stores"}>
                <ArrowLeft data-icon="inline-start" />
                取消
              </Link>
            </Button>
            {store && isAdmin ? (
              <ConfirmActionDialog
                trigger={
                  <Button type="button" variant="outline" disabled={pending}>
                    {store.status === "active" ? (
                      <PauseCircle data-icon="inline-start" />
                    ) : (
                      <PlayCircle data-icon="inline-start" />
                    )}
                    {store.status === "active" ? "停用用户" : "启用用户"}
                  </Button>
                }
                title={store.status === "active" ? "停用用户？" : "启用用户？"}
                description={
                  store.status === "active"
                    ? "停用后，该用户扫码连接服务会立即不可用。"
                    : "启用后，该用户会恢复提供扫码连接服务。"
                }
                confirmLabel={store.status === "active" ? "确认停用" : "确认启用"}
                destructive={store.status === "active"}
                onConfirm={toggleStoreStatus}
              />
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              {pending ? "正在保存…" : "保存更改"}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {store ? (
          <StatusBadge status={store.status} />
        ) : (
          <Badge variant="secondary">尚未保存</Badge>
        )}
        {api.isDemoMode ? <Badge variant="warning">演示模式</Badge> : null}
      </div>

      <Tabs defaultValue={!isAdmin && store ? "wifi" : "basic"}>
        <TabsList>
          <TabsTrigger value="basic">用户资料</TabsTrigger>
          <TabsTrigger value="wifi">Wi-Fi 配置</TabsTrigger>
          <TabsTrigger value="qrcode" disabled={!store}>
            二维码
          </TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="statistics" disabled={!store}>
              统计
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="basic">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-1.5">
                  <CardTitle>用户资料</CardTitle>
                  <CardDescription>用于后台识别和顾客扫码页展示。</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <fieldset disabled={!isAdmin && !isNew}>
                  <FieldGroup>
                    <div className="grid gap-5 md:grid-cols-2">
                      <Field data-invalid={!!errors.name || undefined}>
                        <FieldLabel htmlFor="store-name">用户名称 *</FieldLabel>
                        <Input
                          id="store-name"
                          value={draft.name}
                          onChange={(event) => update("name", event.target.value)}
                          aria-invalid={!!errors.name || undefined}
                        />
                        {errors.name ? <FieldError>{errors.name}</FieldError> : null}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="short-name">简称</FieldLabel>
                        <Input
                          id="short-name"
                          value={draft.shortName}
                          onChange={(event) => update("shortName", event.target.value)}
                        />
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="address">地址</FieldLabel>
                      <div className="relative">
                        <Input
                          id="address"
                          className="pr-9"
                          value={draft.address}
                          onChange={(event) => update("address", event.target.value)}
                        />
                        <MapPin
                          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                    </Field>
                    <div className="grid gap-5 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="contact-name">联系人</FieldLabel>
                        <Input
                          id="contact-name"
                          value={draft.contactName}
                          onChange={(event) => update("contactName", event.target.value)}
                        />
                      </Field>
                      <Field data-invalid={!!errors.contactPhone || undefined}>
                        <FieldLabel htmlFor="contact-phone">联系电话</FieldLabel>
                        <Input
                          id="contact-phone"
                          inputMode="tel"
                          value={draft.contactPhone}
                          onChange={(event) => update("contactPhone", event.target.value)}
                          aria-invalid={!!errors.contactPhone || undefined}
                        />
                        {errors.contactPhone ? (
                          <FieldError>{errors.contactPhone}</FieldError>
                        ) : null}
                      </Field>
                    </div>
                    <Field data-invalid={!!errors.logoUrl || undefined}>
                      <FieldLabel htmlFor="logo-url">用户 Logo 地址</FieldLabel>
                      <Input
                        id="logo-url"
                        type="url"
                        value={draft.logoUrl}
                        onChange={(event) => update("logoUrl", event.target.value)}
                        aria-invalid={!!errors.logoUrl || undefined}
                        placeholder="https://…（可选）"
                      />
                      {errors.logoUrl ? <FieldError>{errors.logoUrl}</FieldError> : null}
                      <FieldDescription>
                        建议使用 256×256 px 的 JPG 或 PNG；不使用外部 CDN。
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </fieldset>
              </CardContent>
            </Card>

            <aside className="flex flex-col gap-5">
              {isAdmin ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-1.5">
                      <CardTitle>连接服务</CardTitle>
                      <CardDescription>控制用户服务与广告展示。</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <Field orientation="horizontal">
                      <div className="flex flex-col gap-1.5">
                        <FieldTitle id="store-status-label">用户状态</FieldTitle>
                        <FieldDescription>停用后，用户无法提供连接服务。</FieldDescription>
                      </div>
                      <Switch
                        aria-labelledby="store-status-label"
                        checked={draft.status === "active"}
                        onCheckedChange={(checked) =>
                          update("status", checked ? "active" : "disabled")
                        }
                      />
                    </Field>
                    <Field orientation="horizontal">
                      <div className="flex flex-col gap-1.5">
                        <FieldTitle id="store-ad-label">用户广告</FieldTitle>
                        <FieldDescription>全局和用户均开启时才加载。</FieldDescription>
                      </div>
                      <Switch
                        aria-labelledby="store-ad-label"
                        checked={draft.adEnabled}
                        onCheckedChange={(checked) => update("adEnabled", checked)}
                      />
                    </Field>
                    <Separator />
                    <div className="flex items-start gap-3 text-sm">
                      <ShieldCheck
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">全局广告状态</span>
                        <span className="text-muted-foreground">按平台全局开关生效</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {store ? (
                <QrCodeCard
                  storeId={store.id}
                  storeName={store.name}
                  qrCode={qrCode}
                  onChange={setQrCode}
                  compact
                />
              ) : (
                <Alert>
                  <UserRound aria-hidden="true" />
                  <AlertTitle>先保存用户</AlertTitle>
                  <AlertDescription>创建用户并保存 Wi-Fi 后，即可生成二维码。</AlertDescription>
                </Alert>
              )}

              {store ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-1.5">
                      <CardTitle>最近更新</CardTitle>
                      <CardDescription>所有敏感操作都会写入审计日志。</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">更新时间</dt>
                        <dd>{formatDateTime(store.updatedAt)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">创建时间</dt>
                        <dd>{formatDateTime(store.createdAt)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Wi-Fi 版本</dt>
                        <dd>v{store.wifi.version ?? 0}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              ) : null}
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="wifi">
          <Card className="max-w-4xl">
            <CardHeader>
              <div className="flex flex-col gap-1.5">
                <CardTitle>Wi-Fi 配置</CardTitle>
                <CardDescription>
                  密码经过认证加密保存；后台不能读取原密码，只能替换。
                </CardDescription>
              </div>
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Wifi className="size-5 stroke-[1.75]" aria-hidden="true" />
              </span>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!errors.ssid || undefined}>
                  <FieldLabel htmlFor="ssid">Wi-Fi 名称（SSID）*</FieldLabel>
                  <Input
                    id="ssid"
                    value={draft.ssid}
                    onChange={(event) => update("ssid", event.target.value)}
                    aria-invalid={!!errors.ssid || undefined}
                  />
                  {errors.ssid ? <FieldError>{errors.ssid}</FieldError> : null}
                </Field>

                {passwordEditing ? (
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field data-invalid={!!errors.newPassword || undefined}>
                      <FieldLabel htmlFor="new-password">
                        {draft.securityType === "OPEN"
                          ? "Wi-Fi 密码（开放网络请留空）"
                          : isNew
                            ? "Wi-Fi 密码 *"
                            : "新 Wi-Fi 密码 *"}
                      </FieldLabel>
                      <Input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        value={draft.newPassword}
                        onChange={(event) => update("newPassword", event.target.value)}
                        aria-invalid={!!errors.newPassword || undefined}
                      />
                      <FieldDescription>
                        此值只提交到服务端，不会写入浏览器存储或日志。
                      </FieldDescription>
                      {errors.newPassword ? <FieldError>{errors.newPassword}</FieldError> : null}
                    </Field>
                    <Field data-invalid={!!errors.confirmPassword || undefined}>
                      <FieldLabel htmlFor="confirm-password">
                        {draft.securityType === "OPEN" ? "确认密码（请留空）" : "确认新密码 *"}
                      </FieldLabel>
                      <Input
                        id="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={draft.confirmPassword}
                        onChange={(event) => update("confirmPassword", event.target.value)}
                        aria-invalid={!!errors.confirmPassword || undefined}
                      />
                      {errors.confirmPassword ? (
                        <FieldError>{errors.confirmPassword}</FieldError>
                      ) : null}
                    </Field>
                    {!isNew ? (
                      <div className="md:col-span-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPasswordEditing(false);
                            update("newPassword", "");
                            update("confirmPassword", "");
                          }}
                        >
                          取消修改密码
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <Field>
                    <FieldLabel htmlFor="password-mask">Wi-Fi 密码</FieldLabel>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1">
                        <Input
                          id="password-mask"
                          value={store?.wifi.passwordMasked ?? "••••••••"}
                          disabled
                          aria-label="已加密的 Wi-Fi 密码"
                        />
                        <EyeOff
                          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setPasswordEditing(true)}
                      >
                        <KeyRound data-icon="inline-start" />
                        修改密码
                      </Button>
                    </div>
                    <FieldDescription>
                      固定掩码不反映原密码长度；平台不会返回或展示原密码。
                    </FieldDescription>
                  </Field>
                )}

                {wifiConfigurationChanged && !passwordEditing ? (
                  <Alert variant="warning">
                    <KeyRound aria-hidden="true" />
                    <AlertTitle>需要替换密码</AlertTitle>
                    <AlertDescription>
                      网络参数已变化。为保证服务端不读取旧密码，请点击“修改密码”并提交新密码。
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="grid gap-5 md:grid-cols-2">
                  <Field data-invalid={!!errors.bssid || undefined}>
                    <FieldLabel htmlFor="bssid">BSSID（可选）</FieldLabel>
                    <Input
                      id="bssid"
                      value={draft.bssid}
                      onChange={(event) => update("bssid", event.target.value.toUpperCase())}
                      aria-invalid={!!errors.bssid || undefined}
                      placeholder="AA:BB:CC:DD:EE:FF"
                    />
                    {errors.bssid ? <FieldError>{errors.bssid}</FieldError> : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="security-type">安全类型</FieldLabel>
                    <Select
                      value={draft.securityType}
                      onValueChange={(value) => {
                        if (isEditableWifiSecurityType(value)) update("securityType", value);
                      }}
                    >
                      <SelectTrigger id="security-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {!WIFI_SECURITY_TYPE_OPTIONS.some(
                            (option) => option.value === draft.securityType,
                          ) ? (
                            <SelectItem value={draft.securityType}>
                              {formatWifiSecurityType(draft.securityType)}
                            </SelectItem>
                          ) : null}
                          {WIFI_SECURITY_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {isAdmin ? (
                  <Field orientation="horizontal">
                    <div className="flex flex-col gap-1.5">
                      <FieldTitle id="wifi-status-label">Wi-Fi 配置状态</FieldTitle>
                      <FieldDescription>关闭后保留配置，但不向顾客端下发。</FieldDescription>
                    </div>
                    <Switch
                      aria-labelledby="wifi-status-label"
                      checked={draft.wifiStatus === "active"}
                      onCheckedChange={(checked) =>
                        update("wifiStatus", checked ? "active" : "disabled")
                      }
                    />
                  </Field>
                ) : null}
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qrcode">
          {store ? (
            <div className="max-w-2xl">
              <QrCodeCard
                storeId={store.id}
                storeName={store.name}
                qrCode={qrCode}
                onChange={setQrCode}
              />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="statistics">
          {store && isAdmin ? <StatisticsPanel storeId={store.id} /> : null}
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-4 ml-auto flex items-center gap-3 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur lg:hidden">
        {pending ? <Spinner className="size-4" /> : <CircleCheck className="size-4 text-primary" />}
        <span className="text-xs text-muted-foreground">
          {pending ? "正在保存" : "修改后请保存"}
        </span>
        <Button type="submit" size="sm" disabled={pending}>
          保存
        </Button>
      </div>
    </form>
  );
}
