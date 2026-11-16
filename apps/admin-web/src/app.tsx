import * as React from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AuthLoadingScreen, useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/resource-state";

const AccountsPage = React.lazy(() => import("@/pages/accounts-page"));
const PasswordPage = React.lazy(() => import("@/pages/password-page"));
const DashboardPage = React.lazy(() => import("@/pages/dashboard-page"));
const LoginPage = React.lazy(() => import("@/pages/login-page"));
const NotFoundPage = React.lazy(() => import("@/pages/not-found-page"));
const OperationLogsPage = React.lazy(() => import("@/pages/operation-logs-page"));
const QrCodesPage = React.lazy(() => import("@/pages/qr-codes-page"));
const SettingsPage = React.lazy(() => import("@/pages/settings-page"));
const StoreDetailPage = React.lazy(() => import("@/pages/store-detail-page"));
const StoreEditorPage = React.lazy(() => import("@/pages/store-editor-page"));
const StoresPage = React.lazy(() => import("@/pages/stores-page"));

function ProtectedRoute(): React.JSX.Element {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <AuthLoadingScreen />;
  if (status === "anonymous") {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return <Outlet />;
}

function PlatformAdminRoute(): React.JSX.Element {
  const { admin } = useAuth();
  return admin?.role === "admin" ? <Outlet /> : <Navigate to="/stores" replace />;
}

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <React.Suspense
        fallback={
          <div className="p-6">
            <PageSkeleton />
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="stores" element={<StoresPage />} />
              <Route path="stores/new" element={<StoreEditorPage />} />
              <Route path="stores/:id" element={<StoreDetailPage />} />
              <Route path="stores/:id/edit" element={<StoreEditorPage />} />
              <Route path="qrcodes" element={<QrCodesPage />} />
              <Route path="password" element={<PasswordPage />} />
              <Route element={<PlatformAdminRoute />}>
                <Route index element={<DashboardPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="operation-logs" element={<OperationLogsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
}
