import * as React from "react";

import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, SESSION_EXPIRED_EVENT } from "@/lib/api";
import type { AdminIdentity } from "@/lib/types";

interface AuthContextValue {
  admin: AdminIdentity | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [status, setStatus] = React.useState<AuthContextValue["status"]>("loading");
  const [admin, setAdmin] = React.useState<AdminIdentity | null>(null);

  React.useEffect(() => {
    let active = true;
    const expireSession = (): void => {
      setAdmin(null);
      setStatus("anonymous");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    void api
      .session()
      .then((session) => {
        if (!active) return;
        setAdmin(session.admin);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status !== 401) {
          console.warn("Session check failed", error.code);
        }
        setAdmin(null);
        setStatus("anonymous");
      });
    return () => {
      active = false;
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
    };
  }, []);

  const login = React.useCallback(async (username: string, password: string) => {
    const session = await api.login(username, password);
    setAdmin(session.admin);
    setStatus("authenticated");
  }, []);

  const logout = React.useCallback(async () => {
    await api.logout();
    setAdmin(null);
    setStatus("anonymous");
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ admin, status, login, logout }),
    [admin, login, logout, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function AuthLoadingScreen(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner className="size-5" />
        正在验证登录状态…
      </div>
    </div>
  );
}
