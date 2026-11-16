import * as React from "react";
import { useAuth } from "@/auth/auth-context";
import Download from "lucide-react/dist/esm/icons/download";
import Eye from "lucide-react/dist/esm/icons/eye";
import QrCode from "lucide-react/dist/esm/icons/qr-code";
import Search from "lucide-react/dist/esm/icons/search";

import { PageHeader } from "@/components/page-header";
import { QrCodeCard } from "@/components/qr-code-card";
import { ResourceEmpty, ResourceError, TableSkeleton } from "@/components/resource-state";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatDateTime } from "@/lib/format";
import type { QrCodeResponse, QrCodeStatus, StoreSummary } from "@/lib/types";

interface QrRow {
  store: StoreSummary;
  qrCode: QrCodeResponse | null;
}

export async function loadQrRows(search: string): Promise<QrRow[]> {
  const rows: QrRow[] = [];
  let page = 1;
  let totalPages: number;
  do {
    const stores = await api.listStores({ page, pageSize: 100, search, status: "all" });
    const qrCodes = await Promise.all(
      stores.items.map((store) =>
        store.qrCode !== undefined ? Promise.resolve(store.qrCode) : api.getQrCode(store.id),
      ),
    );
    rows.push(...stores.items.map((store, index) => ({ store, qrCode: qrCodes[index] ?? null })));
    totalPages = stores.totalPages;
    page += 1;
  } while (page <= totalPages);
  return rows;
}

export default function QrCodesPage(): React.JSX.Element {
  const { admin } = useAuth();
  const isAdmin = admin?.role === "admin";
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<QrCodeStatus | "all" | "missing">("all");
  const [overrides, setOverrides] = React.useState<Record<string, QrCodeResponse>>({});
  const loader = React.useCallback(() => loadQrRows(search), [search]);
  const { resource, reload } = useAsyncResource(loader);

  React.useEffect(() => {
    if (resource.status === "success") setOverrides({});
  }, [resource]);

  const rows = React.useMemo(() => {
    if (resource.status !== "success") return [];
    return resource.data
      .map((row) => ({ ...row, qrCode: overrides[row.store.id] ?? row.qrCode }))
      .filter((row) => {
        if (status === "all") return true;
        if (status === "missing") return row.qrCode === null;
        return row.qrCode?.status === status;
      });
  }, [overrides, resource, status]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="二维码"
        description="生成、预览和下载用户小程序码。二维码不包含 Wi-Fi 密码。"
      />
      <Card>
        <CardHeader className="flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-1.5">
            <CardTitle>用户二维码</CardTitle>
            <CardDescription>本地占位码会明确标记，不能作为正式微信小程序码使用。</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <form
              className="flex w-full gap-2 sm:min-w-72"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchInput.trim());
              }}
            >
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="qr-search" className="sr-only">
                  搜索用户
                </FieldLabel>
                <Input
                  id="qr-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="搜索用户"
                />
              </Field>
              <Button type="submit" variant="outline" size="icon" aria-label="搜索">
                <Search />
              </Button>
            </form>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger className="sm:w-40" aria-label="二维码状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="disabled">停用</SelectItem>
                  <SelectItem value="missing">未生成</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {resource.status === "loading" ? <TableSkeleton rows={5} columns={6} /> : null}
          {resource.status === "error" ? (
            <div className="p-5">
              <ResourceError error={resource.error} onRetry={reload} />
            </div>
          ) : null}
          {resource.status === "success" && rows.length === 0 ? (
            <ResourceEmpty
              title="暂无二维码记录"
              description="调整筛选，或在用户编辑页完成配置后生成二维码。"
            />
          ) : null}
          {resource.status === "success" && rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>预览</TableHead>
                  <TableHead>用户</TableHead>
                  {isAdmin ? <TableHead>二维码创建账号</TableHead> : null}
                  <TableHead>状态</TableHead>
                  <TableHead>提供方</TableHead>
                  <TableHead>生成时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ store, qrCode }) => (
                  <TableRow key={store.id}>
                    <TableCell>
                      {qrCode ? (
                        <img
                          src={api.assetUrl(qrCode.previewUrl)}
                          alt=""
                          className="size-14 rounded-md border bg-background object-contain p-1"
                        />
                      ) : (
                        <span className="flex size-14 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                          <QrCode className="size-5" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-52 flex-col gap-1">
                        <span className="font-medium">{store.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {store.address ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    {isAdmin ? (
                      <TableCell>
                        {qrCode ? (qrCode.createdByUsername ?? "历史记录，未记录") : "—"}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <StatusBadge status={qrCode?.status ?? null} />
                    </TableCell>
                    <TableCell>
                      {qrCode?.provider === "local-placeholder" ? (
                        <Badge variant="warning">本地占位</Badge>
                      ) : qrCode ? (
                        <Badge variant="success">微信</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(qrCode?.generatedAt ?? null)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {qrCode ? (
                          <a
                            href={api.assetUrl(qrCode.downloadUrl)}
                            download={`${store.name}-小程序码.png`}
                            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
                            aria-label={`下载 ${store.name} 二维码`}
                          >
                            <Download />
                          </a>
                        ) : null}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Eye data-icon="inline-start" />
                              管理
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-xl">
                            <DialogHeader>
                              <DialogTitle>{store.name} · 二维码</DialogTitle>
                              <DialogDescription>
                                预览、下载并管理当前二维码状态。
                              </DialogDescription>
                            </DialogHeader>
                            <QrCodeCard
                              compact
                              storeId={store.id}
                              storeName={store.name}
                              qrCode={qrCode}
                              onChange={(value) =>
                                setOverrides((current) => ({ ...current, [store.id]: value }))
                              }
                            />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
