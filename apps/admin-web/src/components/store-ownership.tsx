import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageSkeleton, ResourceError } from "@/components/resource-state";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api } from "@/lib/api";
import type { StoreDetail } from "@/lib/types";

export function StoreOwnership({
  store,
  onChange,
}: {
  store: StoreDetail;
  onChange: () => void;
}): React.JSX.Element {
  const loader = React.useCallback(() => api.listAccounts(), []);
  const { resource, reload } = useAsyncResource(loader);
  const [ownerId, setOwnerId] = React.useState(store.ownerId ?? "");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => setOwnerId(store.ownerId ?? ""), [store.ownerId]);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await api.transferStore(store.id, ownerId || null, reason.trim());
      toast.success("负责人已更新，二维码和 Wi-Fi 保留");
      setReason("");
      onChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "转移失败");
    } finally {
      setPending(false);
    }
  };
  if (resource.status === "loading") return <PageSkeleton />;
  if (resource.status === "error") return <ResourceError error={resource.error} onRetry={reload} />;
  const currentOwner = resource.data.find((account) => account.id === store.ownerId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>用户归属</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          创建人：{store.createdByUsername ?? "历史记录，未记录"} · 当前负责人：
          {currentOwner
            ? `${currentOwner.username}${currentOwner.status === "disabled" ? "（已停用）" : ""}`
            : "平台用户"}
        </p>
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(event) => void submit(event)}
        >
          <Field>
            <FieldLabel htmlFor="store-owner">新负责人</FieldLabel>
            <select
              id="store-owner"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">平台用户（仅管理员可管理）</option>
              {resource.data
                .filter((account) => account.status === "active" || account.id === store.ownerId)
                .map((account) => (
                  <option
                    key={account.id}
                    value={account.id}
                    disabled={account.status !== "active"}
                  >
                    {account.username}（{account.role === "admin" ? "管理员" : "同仁"}）
                  </option>
                ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="transfer-reason">转移原因</FieldLabel>
            <Input
              id="transfer-reason"
              required
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            disabled={pending || ownerId === (store.ownerId ?? "") || !reason.trim()}
          >
            转移用户
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
