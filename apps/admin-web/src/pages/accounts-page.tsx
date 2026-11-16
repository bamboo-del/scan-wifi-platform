import * as React from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton, ResourceError } from "@/components/resource-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api } from "@/lib/api";

export default function AccountsPage(): React.JSX.Element {
  const loader = React.useCallback(() => api.listAccounts(), []);
  const { resource, reload } = useAsyncResource(loader);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [resetPasswords, setResetPasswords] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    if (pending) return;
    setPending(true);
    try {
      await action();
      toast.success(message);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="同仁账号"
        description="同仁只能新增用户、配置初始 Wi-Fi 和生成二维码。停用或重置密码会撤销其登录会话。"
      />
      <Card>
        <CardHeader>
          <CardTitle>新增同仁</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await api.createOperator(username.trim(), password);
                setUsername("");
                setPassword("");
              }, "同仁账号已创建");
            }}
          >
            <Field>
              <FieldLabel htmlFor="operator-username">用户名</FieldLabel>
              <Input
                id="operator-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                minLength={3}
                maxLength={64}
                pattern={"[a-zA-Z0-9._\\-]+"}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="operator-password">初始密码</FieldLabel>
              <Input
                id="operator-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={10}
                maxLength={256}
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" disabled={pending}>
              创建账号
            </Button>
          </form>
          <p className="mt-3 text-sm text-muted-foreground">
            密码至少 10 位；通过私下渠道交给同仁。同仁登录后可自行修改。
          </p>
        </CardContent>
      </Card>
      {resource.status === "loading" ? (
        <PageSkeleton />
      ) : resource.status === "error" ? (
        <ResourceError error={resource.error} onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-3">
          {resource.data.map((account) => (
            <Card key={account.id}>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{account.username}</p>
                  <p className="text-sm text-muted-foreground">
                    {account.role === "admin" ? "管理员" : "同仁"} ·{" "}
                    {account.status === "active" ? "已启用" : "已停用"}
                  </p>
                </div>
                {account.role === "operator" ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(async () => {
                          await api.resetAccountPassword(
                            account.id,
                            resetPasswords[account.id] ?? "",
                          );
                          setResetPasswords((values) => ({ ...values, [account.id]: "" }));
                        }, "密码已重置，旧会话已撤销");
                      }}
                    >
                      <Input
                        type="password"
                        aria-label={`${account.username}的新密码`}
                        value={resetPasswords[account.id] ?? ""}
                        onChange={(event) =>
                          setResetPasswords((values) => ({
                            ...values,
                            [account.id]: event.target.value,
                          }))
                        }
                        required
                        minLength={10}
                        maxLength={256}
                        autoComplete="new-password"
                        placeholder="新密码，至少 10 位"
                      />
                      <Button type="submit" variant="outline" disabled={pending}>
                        重置密码
                      </Button>
                    </form>
                    <ConfirmActionDialog
                      trigger={
                        <Button variant="outline" disabled={pending}>
                          {account.status === "active" ? "停用账号" : "启用账号"}
                        </Button>
                      }
                      title={`${account.status === "active" ? "停用" : "启用"} ${account.username}？`}
                      description="用户及顾客二维码保留。停用后该同仁无法登录，必要时请在用户详情转移负责人。"
                      confirmLabel="确认"
                      destructive={account.status === "active"}
                      onConfirm={() =>
                        run(
                          () =>
                            api.setAccountStatus(
                              account.id,
                              account.status === "active" ? "disabled" : "active",
                            ),
                          "账号状态已更新",
                        )
                      }
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
