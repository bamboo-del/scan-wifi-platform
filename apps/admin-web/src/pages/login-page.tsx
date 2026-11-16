import * as React from "react";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import KeyRound from "lucide-react/dist/esm/icons/key-round";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import UserRound from "lucide-react/dist/esm/icons/user-round";
import Wifi from "lucide-react/dist/esm/icons/wifi";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { AuthLoadingScreen, useAuth } from "@/auth/auth-context";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";

interface LocationState {
  from?: string;
}

export default function LoginPage(): React.JSX.Element {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const usernameInvalid = error !== null && !username.trim();
  const passwordInvalid = error !== null && !password;

  if (status === "loading") return <AuthLoadingScreen />;
  if (status === "authenticated") return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await login(username.trim(), password);
      void navigate(state?.from ?? "/", { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败，请稍后重试");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
      <section className="relative hidden overflow-hidden border-r bg-sidebar p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 surface-grid opacity-55" aria-hidden="true" />
        <Brand className="relative" />
        <div className="relative flex max-w-xl flex-col gap-6">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Wifi className="size-7 stroke-[1.75]" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              统一维护用户连接服务
            </h1>
            <p className="max-w-lg text-base leading-8 text-muted-foreground">
              管理用户资料、Wi-Fi
              配置、小程序码和匿名连接统计。管理员与同仁使用各自账号登录，账号由管理员创建。
            </p>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              HttpOnly Cookie 会话
            </div>
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              Wi-Fi 密码仅可替换
            </div>
          </div>
        </div>
        <p className="relative text-xs text-muted-foreground">轻连 WiFi · 平台管理中心</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <Card className="w-full max-w-md border-0 sm:border">
          <CardHeader className="flex-col">
            <Brand className="mb-6 lg:hidden" />
            <div className="flex flex-col gap-2">
              <CardTitle className="text-2xl">登录管理后台</CardTitle>
              <CardDescription>平台管理员与同仁使用各自账号登录。</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => void submit(event)}
              noValidate
            >
              {error ? (
                <Alert variant="destructive">
                  <ShieldCheck aria-hidden="true" />
                  <AlertTitle>登录失败</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <FieldGroup>
                <Field data-invalid={usernameInvalid || undefined}>
                  <FieldLabel htmlFor="username">用户名</FieldLabel>
                  <div className="relative">
                    <UserRound
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      className="pl-9"
                      value={username}
                      aria-invalid={usernameInvalid || undefined}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="请输入用户名"
                    />
                  </div>
                  {usernameInvalid ? <FieldError>请输入用户名</FieldError> : null}
                </Field>
                <Field data-invalid={passwordInvalid || undefined}>
                  <FieldLabel htmlFor="password">密码</FieldLabel>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      className="pl-9"
                      value={password}
                      aria-invalid={passwordInvalid || undefined}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="请输入密码"
                    />
                  </div>
                  <FieldDescription>连续登录失败会触发服务端限流。</FieldDescription>
                  {passwordInvalid ? <FieldError>请输入密码</FieldError> : null}
                </Field>
              </FieldGroup>
              {api.isDemoMode ? (
                <Alert>
                  <AlertTitle>演示模式</AlertTitle>
                  <AlertDescription>用户名 admin，密码 Admin123!</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <ArrowRight data-icon="inline-end" />
                )}
                {pending ? "正在登录…" : "登录"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
