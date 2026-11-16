import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, SESSION_EXPIRED_EVENT } from "@/lib/api";

export default function PasswordPage(): React.JSX.Element {
  const { admin } = useAuth();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    if (newPassword !== confirmation) {
      toast.error("两次新密码不一致");
      return;
    }
    setPending(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success("密码已修改，请重新登录");
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader
        title="修改密码"
        description={`当前账号：${admin?.username ?? ""}。修改后所有设备需重新登录。`}
      />
      <Card>
        <CardContent className="p-6">
          <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
            <Field>
              <FieldLabel htmlFor="current-password">当前密码</FieldLabel>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">新密码</FieldLabel>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={256}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">确认新密码</FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={256}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              保存密码
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
