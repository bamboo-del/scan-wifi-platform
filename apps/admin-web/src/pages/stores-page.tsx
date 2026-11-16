import * as React from "react";
import { useAuth } from "@/auth/auth-context";
import Eye from "lucide-react/dist/esm/icons/eye";
import MoreVertical from "lucide-react/dist/esm/icons/ellipsis-vertical";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Plus from "lucide-react/dist/esm/icons/plus";
import Power from "lucide-react/dist/esm/icons/power";
import Search from "lucide-react/dist/esm/icons/search";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { ResourceEmpty, ResourceError, TableSkeleton } from "@/components/resource-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Spinner } from "@/components/ui/spinner";
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
import type { StoreStatus } from "@/lib/types";

export default function StoresPage(): React.JSX.Element {
  const { admin } = useAuth();
  const isAdmin = admin?.role === "admin";
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StoreStatus | "all">("all");
  const [page, setPage] = React.useState(1);
  const [pendingStore, setPendingStore] = React.useState<string | null>(null);

  const loader = React.useCallback(
    () => api.listStores({ page, pageSize: 10, search, status }),
    [page, search, status],
  );
  const { resource, reload } = useAsyncResource(loader);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const changeStatus = async (storeId: string, status: StoreStatus): Promise<void> => {
    setPendingStore(storeId);
    try {
      await api.setStoreStatus(storeId, status);
      toast.success(status === "active" ? "用户已启用" : "用户已停用");
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "用户状态更新失败");
    } finally {
      setPendingStore(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="用户管理"
        description="管理当前账号可访问的用户资料、连接配置和服务状态。"
        actions={
          <Button asChild>
            <Link to="/stores/new">
              <Plus data-icon="inline-start" />
              新建用户
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-1.5">
            <CardTitle>用户列表</CardTitle>
            <CardDescription>搜索用户名称、简称或地址。</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <form className="flex w-full gap-2 sm:min-w-80" onSubmit={submitSearch}>
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="store-search" className="sr-only">
                  搜索用户
                </FieldLabel>
                <Input
                  id="store-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="用户名称、简称或地址"
                />
              </Field>
              <Button type="submit" variant="outline">
                <Search data-icon="inline-start" />
                搜索
              </Button>
            </form>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as StoreStatus | "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-40" aria-label="筛选用户状态">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
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
          {resource.status === "loading" ? <TableSkeleton rows={6} columns={6} /> : null}
          {resource.status === "error" ? (
            <div className="p-5">
              <ResourceError error={resource.error} onRetry={reload} />
            </div>
          ) : null}
          {resource.status === "success" && resource.data.items.length === 0 ? (
            <ResourceEmpty
              title="没有找到用户"
              description="调整搜索或状态筛选，或者创建第一位用户。"
              action={
                <Button asChild>
                  <Link to="/stores/new">
                    <Plus data-icon="inline-start" />
                    新建用户
                  </Link>
                </Button>
              }
            />
          ) : null}
          {resource.status === "success" && resource.data.items.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    {isAdmin ? <TableHead>创建账号</TableHead> : null}
                    <TableHead>状态</TableHead>
                    <TableHead>Wi-Fi</TableHead>
                    <TableHead>二维码</TableHead>
                    <TableHead>广告</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resource.data.items.map((store) => (
                    <TableRow key={store.id} className="content-auto">
                      <TableCell>
                        <button
                          type="button"
                          className="flex min-w-56 flex-col gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                          onClick={() => navigate(`/stores/${store.id}`)}
                        >
                          <span className="font-medium text-foreground">{store.name}</span>
                          <span className="max-w-72 truncate text-xs text-muted-foreground">
                            {store.address ?? "—"}
                          </span>
                        </button>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell>{store.createdByUsername ?? "历史记录，未记录"}</TableCell>
                      ) : null}
                      <TableCell>
                        <StatusBadge status={store.status} />
                      </TableCell>
                      <TableCell>{store.hasWifi ? "已配置" : "未配置"}</TableCell>
                      <TableCell>
                        <StatusBadge status={store.qrCodeStatus} />
                      </TableCell>
                      <TableCell>{store.adEnabled ? "已开启" : "已关闭"}</TableCell>
                      <TableCell>{formatDateTime(store.updatedAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin ? (
                            <ConfirmActionDialog
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={
                                    store.status === "active"
                                      ? `停用 ${store.name}`
                                      : `启用 ${store.name}`
                                  }
                                  disabled={pendingStore === store.id}
                                >
                                  {pendingStore === store.id ? <Spinner /> : <Power />}
                                </Button>
                              }
                              title={store.status === "active" ? "停用用户？" : "启用用户？"}
                              description={
                                store.status === "active"
                                  ? "停用后，该用户将无法继续提供扫码连接服务。"
                                  : "启用后，该用户将恢复提供扫码连接服务。"
                              }
                              confirmLabel={store.status === "active" ? "确认停用" : "确认启用"}
                              destructive={store.status === "active"}
                              onConfirm={() =>
                                changeStatus(
                                  store.id,
                                  store.status === "active" ? "disabled" : "active",
                                )
                              }
                            />
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label={`${store.name} 更多操作`}
                              >
                                <MoreVertical />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuGroup>
                                <DropdownMenuItem onSelect={() => navigate(`/stores/${store.id}`)}>
                                  <Eye />
                                  查看详情
                                </DropdownMenuItem>
                                {isAdmin ? (
                                  <DropdownMenuItem
                                    onSelect={() => navigate(`/stores/${store.id}/edit`)}
                                  >
                                    <Pencil />
                                    编辑
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationControls
                page={resource.data.page}
                totalPages={resource.data.totalPages}
                total={resource.data.total}
                onPageChange={setPage}
              />
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
