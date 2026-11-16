import * as React from "react";
import CircleCheckBig from "lucide-react/dist/esm/icons/circle-check-big";
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed";
import Megaphone from "lucide-react/dist/esm/icons/megaphone";
import QrCode from "lucide-react/dist/esm/icons/qr-code";
import Save from "lucide-react/dist/esm/icons/save";
import ShieldAlert from "lucide-react/dist/esm/icons/shield-alert";
import Wifi from "lucide-react/dist/esm/icons/wifi";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton, ResourceError } from "@/components/resource-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api } from "@/lib/api";

export default function SettingsPage(): React.JSX.Element {
  const loader = React.useCallback(() => api.settings(), []);
  const { resource, reload } = useAsyncResource(loader);
  const [globalAdEnabled, setGlobalAdEnabled] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (resource.status === "success") setGlobalAdEnabled(resource.data.globalAdEnabled);
  }, [resource]);

  if (resource.status === "loading") return <PageSkeleton />;
  if (resource.status === "error") return <ResourceError error={resource.error} onRetry={reload} />;

  const settings = resource.data;
  const save = async (): Promise<void> => {
    setPending(true);
    try {
      await api.updateSettings(globalAdEnabled);
      toast.success("系统设置已保存");
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设置保存失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="系统设置" description="管理全局广告开关并检查微信平台相关服务配置状态。" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5">
              <CardTitle>广告管理</CardTitle>
              <CardDescription>全局关闭时，所有门店都不会加载 Banner 广告。</CardDescription>
            </div>
            <Megaphone className="size-5 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <Field orientation="horizontal">
              <div className="flex flex-col gap-1.5">
                <FieldTitle id="global-ad-label">全局广告开关</FieldTitle>
                <FieldDescription>
                  广告能力和广告位配置就绪、门店与全局开关同时开启后，顾客页才加载广告。
                </FieldDescription>
              </div>
              <Switch
                id="global-ad"
                aria-labelledby="global-ad-label"
                checked={globalAdEnabled}
                onCheckedChange={setGlobalAdEnabled}
              />
            </Field>
          </CardContent>
          <CardFooter className="justify-end border-t pt-5">
            <Button
              onClick={() => void save()}
              disabled={pending || globalAdEnabled === settings.globalAdEnabled}
            >
              {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              保存设置
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5">
              <CardTitle>服务配置状态</CardTitle>
              <CardDescription>凭据只保存在 API 服务端环境变量中。</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ConfigStatus
              icon={Megaphone}
              label="广告位 ID"
              configured={settings.adUnitConfigured}
            />
            <ConfigStatus
              icon={QrCode}
              label="小程序码服务"
              configured={settings.wechatQrConfigured}
            />
            <ConfigStatus
              icon={Wifi}
              label="微信 Wi-Fi 兼容适配"
              configured={settings.legacyWifiApiEnabled}
              disabledLabel="生产禁用"
            />
            <Alert variant="warning">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle>需要人工验证</AlertTitle>
              <AlertDescription>
                微信 Wi-Fi API 当前兼容状态需使用目标 AppID 在真机验证；未验证前生产环境保持禁用。
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1.5">
            <CardTitle>二维码提供方</CardTitle>
            <CardDescription>生产环境不得自动回退到普通二维码或本地占位实现。</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant={settings.qrCodeProvider === "wechat" ? "success" : "warning"}>
            {settings.qrCodeProvider === "wechat" ? "微信正式小程序码" : "本地占位提供方"}
          </Badge>
          {api.isDemoMode ? <Badge variant="secondary">演示模式</Badge> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigStatus({
  icon: Icon,
  label,
  configured,
  disabledLabel = "未配置",
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  configured: boolean;
  disabledLabel?: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Badge variant={configured ? "success" : "secondary"}>
        {configured ? <CircleCheckBig aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
        {configured ? "已配置" : disabledLabel}
      </Badge>
    </div>
  );
}
