import * as React from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import { AuthLoadingScreen, useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/resource-state";

const MerchantsPage = React.lazy(() => import("@/pages/merchants-page"));
const AnalyticsPage = React.lazy(() => import("@/pages/analytics-page"));
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
              <Route index element={<DashboardPage />} />
              <Route path="merchants" element={<MerchantsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="stores" element={<StoresPage />} />
              <Route path="stores/new" element={<StoreEditorPage />} />
              <Route path="stores/:id" element={<StoreDetailPage />} />
              <Route path="stores/:id/edit" element={<StoreEditorPage />} />
              <Route path="qrcodes" element={<QrCodesPage />} />
              <Route path="operation-logs" element={<OperationLogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
}
