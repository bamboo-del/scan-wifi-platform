import * as React from "react";
import { toast } from "sonner";
import type { MerchantResponse } from "@scan-wifi/shared-types";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton, ResourceError } from "@/components/resource-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { StatusBadge } from "@/components/status-badge";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api } from "@/lib/api";

export default function MerchantsPage(): React.JSX.Element {
  const loader = React.useCallback(() => api.listMerchants(), []);
  const { resource, reload } = useAsyncResource(loader);
  const [editing, setEditing] = React.useState<MerchantResponse | null>(null);
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    try {
      await api.saveMerchant(
        { name: name.trim(), contact: contact.trim() || null, status: editing?.status ?? "active" },
        editing?.id,
      );
      setEditing(null);
      setName("");
      setContact("");
      reload();
      toast.success("商户已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setPending(false);
    }
  };
  const toggle = async (merchant: MerchantResponse): Promise<void> => {
    setPending(true);
    try {
      await api.saveMerchant(
        {
          name: merchant.name,
          contact: merchant.contact,
          status: merchant.status === "active" ? "disabled" : "active",
        },
        merchant.id,
      );
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="商户管理"
        description="一个商户可管理多个门店；停用商户后，其门店暂停提供扫码连接。"
      />
      <Card>
        <CardContent className="pt-6">
          <form
            className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => void save(event)}
          >
            <Field>
              <FieldLabel htmlFor="merchant-name">商户名称</FieldLabel>
              <Input
                id="merchant-name"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="merchant-contact">联系方式</FieldLabel>
              <Input
                id="merchant-contact"
                maxLength={120}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {editing ? "保存商户" : "创建商户"}
              </Button>
              {editing ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setName("");
                    setContact("");
                  }}
                >
                  取消
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
        <div className="grid gap-4 md:grid-cols-2">
          {resource.data.map((merchant) => (
            <Card key={merchant.id}>
              <CardContent className="flex flex-wrap items-center gap-4 pt-6">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-semibold">{merchant.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {merchant.contact ?? "未填写联系方式"}
                  </p>
                </div>
                <StatusBadge status={merchant.status} />
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setEditing(merchant);
                    setName(merchant.name);
                    setContact(merchant.contact ?? "");
                  }}
                >
                  编辑
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => void toggle(merchant)}>
                  {merchant.status === "active" ? "停用" : "启用"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
