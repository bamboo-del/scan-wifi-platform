import * as React from "react";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import FileClock from "lucide-react/dist/esm/icons/file-clock";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import Menu from "lucide-react/dist/esm/icons/menu";
import PanelLeftClose from "lucide-react/dist/esm/icons/panel-left-close";
import PanelLeftOpen from "lucide-react/dist/esm/icons/panel-left-open";
import QrCode from "lucide-react/dist/esm/icons/qr-code";
import Settings from "lucide-react/dist/esm/icons/settings";
import Store from "lucide-react/dist/esm/icons/store";
import UserRound from "lucide-react/dist/esm/icons/user-round";
import { NavLink, Outlet, useNavigate } from "react-router";

import { useAuth } from "@/auth/auth-context";
import { Brand } from "@/components/brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { todayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const navigation = [
  { to: "/", label: "仪表盘", icon: LayoutDashboard, end: true },
  { to: "/merchants", label: "商户管理", icon: UserRound, end: false },
  { to: "/analytics", label: "连接统计", icon: LayoutDashboard, end: false },
  { to: "/stores", label: "门店管理", icon: Store, end: false },
  { to: "/qrcodes", label: "二维码", icon: QrCode, end: false },
  { to: "/operation-logs", label: "操作日志", icon: FileClock, end: false },
  { to: "/settings", label: "系统设置", icon: Settings, end: false },
] as const;

function Navigation({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}): React.JSX.Element {
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="主导航">
      {navigation.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            cn(
              "flex h-11 items-center rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              collapsed ? "justify-center" : "gap-3",
              isActive && "bg-accent text-primary",
            )
          }
        >
          <Icon className="size-5 shrink-0 stroke-[1.75]" aria-hidden="true" />
          {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell(): React.JSX.Element {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    void navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r bg-sidebar transition-[width] duration-200 lg:flex lg:flex-col",
          collapsed ? "w-20" : "w-58",
        )}
      >
        <div className={cn("flex h-22 items-center", collapsed ? "justify-center px-3" : "px-6")}>
          <Brand compact={collapsed} />
        </div>
        <Navigation collapsed={collapsed} />
        <div className="mt-auto p-3">
          <Separator className="mb-3" />
          <Button
            variant="ghost"
            className={cn("w-full", collapsed ? "justify-center" : "justify-start")}
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {collapsed ? null : "收起"}
          </Button>
        </div>
      </aside>

      <div
        className={cn(
          "min-h-screen transition-[padding] duration-200",
          collapsed ? "lg:pl-20" : "lg:pl-58",
        )}
      >
        <header className="sticky top-0 z-40 flex h-18 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="打开导航">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-sidebar">
                <SheetHeader>
                  <SheetTitle className="sr-only">主导航</SheetTitle>
                  <Brand />
                </SheetHeader>
                <Navigation onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <Brand compact />
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex lg:ml-auto">
            <CalendarDays className="size-4 stroke-[1.75]" aria-hidden="true" />
            {todayLabel()}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="ml-3 gap-2 px-2" aria-label="管理员菜单">
                <Avatar className="size-8">
                  <AvatarFallback>
                    <UserRound className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">{admin?.username ?? "admin"}</span>
                <ChevronDown className="hidden size-4 sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
