import * as React from "react";
import FileClock from "lucide-react/dist/esm/icons/file-clock";
import Search from "lucide-react/dist/esm/icons/search";

import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { ResourceEmpty, ResourceError, TableSkeleton } from "@/components/resource-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { OperationLog } from "@/lib/types";

const actionLabels: Record<string, string> = {
  "store.create": "创建用户",
  "store.update": "编辑用户",
  "store.enable": "启用用户",
  "store.disable": "停用用户",
  "wifi.replace": "替换 Wi-Fi 配置",
  "qrcode.generate": "生成二维码",
  "qrcode.enable": "启用二维码",
  "qrcode.disable": "停用二维码",
  "store.transfer": "转移用户",
  "account.create": "新增同仁",
  "account.status": "更新账号状态",
  "account.reset_password": "重置同仁密码",
  "account.change_password": "修改本人密码",
  "settings.update": "更新系统设置",
};

function metadataSummary(metadata: OperationLog["metadata"]): string {
  if (!metadata) return "—";
  if (typeof metadata.reason === "string" && "previousOwnerId" in metadata) {
    const previous =
      typeof metadata.previousOwnerUsername === "string"
        ? metadata.previousOwnerUsername
        : "平台用户";
    const next = typeof metadata.ownerUsername === "string" ? metadata.ownerUsername : "平台用户";
    return `${previous} → ${next}；${metadata.reason}`;
  }
  const safeKeys = Object.keys(metadata).filter((key) => !/(password|secret|token|key)/i.test(key));
  return safeKeys.length ? `字段：${safeKeys.join("、")}` : "已脱敏";
}

export default function OperationLogsPage(): React.JSX.Element {
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [action, setAction] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const loader = React.useCallback(
    () => api.operationLogs({ page, pageSize: 20, search, action }),
    [action, page, search],
  );
  const { resource, reload } = useAsyncResource(loader);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="操作日志"
        description="查看管理员敏感操作记录。元数据经过服务端脱敏，前端不会展示密码、密钥或 Token。"
      />
      <Card>
        <CardHeader className="flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-1.5">
            <CardTitle>审计记录</CardTitle>
            <CardDescription>时间统一由服务端以 UTC 保存，并在此按本地时区显示。</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <form
              className="flex w-full gap-2 sm:min-w-80"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
            >
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="log-search" className="sr-only">
                  搜索日志
                </FieldLabel>
                <Input
                  id="log-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="管理员、动作或资源 ID"
                />
              </Field>
              <Button variant="outline" type="submit">
                <Search data-icon="inline-start" />
                搜索
              </Button>
            </form>
            <Select
              value={action}
              onValueChange={(value) => {
                setAction(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-44" aria-label="操作类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部操作</SelectItem>
                  <SelectItem value="store">用户管理</SelectItem>
                  <SelectItem value="wifi">Wi-Fi 配置</SelectItem>
                  <SelectItem value="qrcode">二维码管理</SelectItem>
                  <SelectItem value="settings">系统设置</SelectItem>
                  <SelectItem value="account">账号管理</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {resource.status === "loading" ? <TableSkeleton rows={7} columns={6} /> : null}
          {resource.status === "error" ? (
            <div className="p-5">
              <ResourceError error={resource.error} onRetry={reload} />
            </div>
          ) : null}
          {resource.status === "success" && resource.data.items.length === 0 ? (
            <ResourceEmpty title="暂无操作记录" description="调整筛选条件后再试。" />
          ) : null}
          {resource.status === "success" && resource.data.items.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>操作者</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>资源类型</TableHead>
                    <TableHead>资源 ID</TableHead>
                    <TableHead>脱敏元数据</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resource.data.items.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell className="font-medium">{log.adminUsername ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{actionLabels[log.action] ?? log.action}</Badge>
                      </TableCell>
                      <TableCell>{log.resourceType}</TableCell>
                      <TableCell>
                        <code className="text-xs">{log.resourceId ?? "—"}</code>
                      </TableCell>
                      <TableCell
                        className="max-w-64 truncate text-muted-foreground"
                        title={metadataSummary(log.metadata)}
                      >
                        {metadataSummary(log.metadata)}
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
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileClock className="size-4" />
        操作日志只记录业务动作，不记录 Wi-Fi 明文密码。
      </div>
    </div>
  );
}
