import * as React from "react";
import { useAuth } from "@/auth/auth-context";
import Copy from "lucide-react/dist/esm/icons/copy";
import Download from "lucide-react/dist/esm/icons/download";
import Eye from "lucide-react/dist/esm/icons/eye";
import PauseCircle from "lucide-react/dist/esm/icons/pause-circle";
import PlayCircle from "lucide-react/dist/esm/icons/play-circle";
import Plus from "lucide-react/dist/esm/icons/plus";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { ResourceEmpty } from "@/components/resource-state";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { QrCodeResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export function QrCodeCard({
  storeId,
  storeName,
  qrCode,
  onChange,
  compact = false,
}: {
  storeId: string;
  storeName: string;
  qrCode: QrCodeResponse | null;
  onChange: (value: QrCodeResponse) => void;
  compact?: boolean;
}): React.JSX.Element {
  const { admin } = useAuth();
  const isAdmin = admin?.role === "admin";
  const [pendingAction, setPendingAction] = React.useState<"generate" | "status" | null>(null);
  const isActive = qrCode?.status === "active";

  const generate = async (): Promise<void> => {
    setPendingAction("generate");
    try {
      const result = await api.generateQrCode(storeId);
      onChange(result);
      toast.success("二维码已生成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "二维码生成失败");
    } finally {
      setPendingAction(null);
    }
  };

  const changeStatus = async (): Promise<void> => {
    if (!qrCode) return;
    setPendingAction("status");
    try {
      const result = await api.setQrCodeStatus(
        qrCode.id,
        qrCode.status === "active" ? "disabled" : "active",
      );
      onChange(result);
      toast.success(result.status === "active" ? "二维码已启用" : "二维码已停用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败");
    } finally {
      setPendingAction(null);
    }
  };

  const copyToken = async (): Promise<void> => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode.sceneToken);
      toast.success("场景 Token 已复制");
    } catch {
      toast.error("复制失败，请检查浏览器剪贴板权限");
    }
  };

  return (
    <Card className={cn(compact && "border-0")}>
      <CardHeader>
        <div className="flex flex-col gap-1.5">
          <CardTitle>当前二维码</CardTitle>
          <CardDescription>二维码仅包含随机场景 Token，不含 Wi-Fi 名称或密码。</CardDescription>
        </div>
        {qrCode ? <StatusBadge status={qrCode.status} /> : null}
      </CardHeader>
      <CardContent>
        {qrCode ? (
          <div className="flex flex-col gap-5">
            <div className="mx-auto flex w-full max-w-56 flex-col items-center gap-2">
              <img
                src={api.assetUrl(qrCode.previewUrl)}
                alt={`${storeName} 小程序码预览`}
                className="aspect-square w-full rounded-lg border bg-background object-contain p-2"
              />
              {qrCode.provider === "local-placeholder" ? (
                <Badge variant="warning">仅供本地测试</Badge>
              ) : null}
            </div>
            <dl className="grid gap-3 text-sm">
              {isAdmin ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">创建账号</dt>
                  <dd className="break-all text-right">
                    {qrCode.createdByUsername ?? "历史记录，未记录"}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">生成时间</dt>
                <dd>{formatDateTime(qrCode.generatedAt)}</dd>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">场景 Token</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <code className="truncate text-xs">{qrCode.sceneToken.slice(0, 8)}••••••••</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="复制场景 Token"
                    onClick={() => void copyToken()}
                  >
                    <Copy />
                  </Button>
                </dd>
              </div>
            </dl>
            <div className="grid gap-2 sm:grid-cols-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Eye data-icon="inline-start" />
                    预览
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{storeName}</DialogTitle>
                    <DialogDescription>打印前请确认用户名称和二维码状态。</DialogDescription>
                  </DialogHeader>
                  <img
                    src={api.assetUrl(qrCode.previewUrl)}
                    alt={`${storeName} 小程序码大图预览`}
                    className="mx-auto aspect-square w-full max-w-80 rounded-xl border bg-background object-contain p-3"
                  />
                </DialogContent>
              </Dialog>
              <a
                href={api.assetUrl(qrCode.downloadUrl)}
                download={`${storeName}-小程序码.png`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download data-icon="inline-start" />
                下载
              </a>
              {isAdmin ? (
                <ConfirmActionDialog
                  trigger={
                    <Button
                      type="button"
                      variant={isActive ? "outline" : "default"}
                      size="sm"
                      disabled={pendingAction !== null}
                    >
                      {pendingAction === "status" ? (
                        <Spinner data-icon="inline-start" />
                      ) : isActive ? (
                        <PauseCircle data-icon="inline-start" />
                      ) : (
                        <PlayCircle data-icon="inline-start" />
                      )}
                      {isActive ? "停用" : "启用"}
                    </Button>
                  }
                  title={isActive ? "停用这个二维码？" : "重新启用二维码？"}
                  description={
                    isActive
                      ? "停用后，顾客扫码将无法获取该用户连接配置，已打印的码会立即失效。"
                      : "启用后，已打印的二维码会恢复提供用户连接服务。"
                  }
                  confirmLabel={isActive ? "确认停用" : "确认启用"}
                  destructive={isActive}
                  onConfirm={changeStatus}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <ResourceEmpty
            title="尚未生成二维码"
            description="完成 Wi-Fi 配置后可生成用户小程序码。"
            action={
              <Button
                type="button"
                onClick={() => void generate()}
                disabled={pendingAction !== null}
              >
                {pendingAction === "generate" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                生成二维码
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
