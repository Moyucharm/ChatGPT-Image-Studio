"use client";

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, ImageIcon, LogOut, PanelLeftClose, PanelLeftOpen, Settings2, Shield, type LucideIcon } from "lucide-react";

import { fetchVersionInfo } from "@/lib/api";
import { clearStoredAuthKey, getStoredAuthSession, type AuthRole } from "@/store/auth";
import { cn } from "@/lib/utils";

const repositoryUrl = "https://github.com/peiyizhi0724/ChatGpt-Image-Studio";

function formatVersionLabel(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/^v+/i, "");
  return normalized ? `v${normalized}` : "读取中";
}

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  requiresAdmin?: boolean;
};

const navItems: NavItem[] = [
  { href: "/image", label: "图片工作台", description: "生成、编辑与放大", icon: ImageIcon },
  { href: "/accounts", label: "账号管理", description: "号池、额度与同步", icon: Shield, requiresAdmin: true },
  { href: "/settings", label: "配置管理", description: "模式、接口与后端配置", icon: Settings2, requiresAdmin: true },
  { href: "/requests", label: "调用请求", description: "查看官方与 CPA 请求方向", icon: Activity, requiresAdmin: true },
];

type DesktopTopNavProps = {
  pathname: string;
  defaultCollapsed: boolean;
  versionLabel: string;
  onLogout: () => Promise<void>;
  navItems: NavItem[];
};

function DesktopTopNav({ pathname, defaultCollapsed, versionLabel, onLogout, navItems }: DesktopTopNavProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <aside className={cn("hidden shrink-0 transition-[width] duration-200 lg:flex", collapsed ? "w-[92px]" : "w-[228px]")}>
      <div className="flex h-full w-full flex-col rounded-xl border border-stone-200 bg-[#f0f0ed] p-3">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg transition",
                  collapsed ? "justify-center px-0 py-3.5" : "px-3 py-3",
                  active ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:bg-white/65 hover:text-stone-900",
                )}
                title={collapsed ? item.label : undefined}
              >
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-lg size-10",
                    active ? "bg-stone-950 text-white" : "bg-white/80 text-stone-600",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                {!collapsed ? (
                  <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden transition-[opacity,width] duration-200">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-stone-500">{item.description}</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <button
            type="button"
            className={cn(
              "flex w-full items-center rounded-lg border border-stone-200 bg-white text-sm font-medium text-stone-700 transition hover:bg-stone-50 whitespace-nowrap overflow-hidden transition-[opacity,width] duration-200 shrink-0",
              collapsed ? "justify-center px-0 py-3 size-10" : "justify-center gap-2 px-4 py-3 h-10",
            )}
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "展开导航" : "收起导航"}
          >
            {collapsed ? <PanelLeftOpen className="size-5 shrink-0" /> : <PanelLeftClose className="size-5 shrink-0" />}
            {!collapsed ? "收起导航" : null}
          </button>
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "block rounded-lg bg-white/70 text-xs text-stone-500 shadow-sm transition hover:bg-white hover:text-stone-700 whitespace-nowrap overflow-hidden transition-[opacity,width] duration-200",
              collapsed ? "px-2 py-3 text-center" : "px-4 py-3",
            )}
            title="打开 GitHub 仓库"
          >
            {!collapsed ? <div className="font-medium text-stone-700">版本</div> : null}
            <div className={cn(!collapsed ? "mt-1" : "font-medium")}>{versionLabel}</div>
          </a>
          <button
            type="button"
            className={cn(
              "flex w-full items-center rounded-lg border border-stone-200 bg-white text-sm font-medium text-stone-700 transition hover:bg-stone-50 whitespace-nowrap overflow-hidden transition-[opacity,width] duration-200 shrink-0",
              collapsed ? "justify-center px-0 py-3 size-10" : "justify-center gap-2 px-4 py-3 h-10",
            )}
            onClick={() => void onLogout()}
            title={collapsed ? "退出登录" : undefined}
          >
            <LogOut className="size-5 shrink-0" />
            {!collapsed ? "退出登录" : null}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function TopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isImageRoute = pathname === "/image" || pathname?.startsWith("/image/");
  const [versionLabel, setVersionLabel] = useState("读取中");
  const [sessionRole, setSessionRole] = useState<AuthRole | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadVersion = async () => {
      try {
        const payload = await fetchVersionInfo();
        if (!cancelled) {
          setVersionLabel(formatVersionLabel(payload.version));
        }
      } catch {
        if (!cancelled) {
          setVersionLabel("未知版本");
        }
      }
    };

    void loadVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const session = await getStoredAuthSession();
        if (!cancelled) {
          setSessionRole(session.role);
          setSessionLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setSessionRole(null);
          setSessionLoaded(true);
        }
      }
    };

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await clearStoredAuthKey();
    navigate("/login", { replace: true });
  };

  if (pathname === "/login" || pathname === "/login.html" || pathname.startsWith("/login/")) {
    return null;
  }

  if (!sessionLoaded || !sessionRole) {
    return null;
  }

  const visibleNavItems = sessionRole === "guest" ? navItems.filter((item) => !item.requiresAdmin) : navItems;
  const defaultCollapsed = sessionRole === "guest" ? false : isImageRoute;
  const mobileGridClass = visibleNavItems.length > 1 ? "grid-cols-2" : "grid-cols-1";

  return (
    <>
      <header className="lg:hidden">
        <div className="rounded-xl border border-stone-200 bg-[#f0f0ed] p-3">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              onClick={() => void handleLogout()}
            >
              <LogOut className="size-4" />
            </button>
          </div>

          <nav className={cn("mt-3 grid gap-2", mobileGridClass)}>
            {visibleNavItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 transition",
                    active ? "bg-white text-stone-950 shadow-sm" : "bg-white/60 text-stone-600 hover:bg-white hover:text-stone-900",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl",
                      active ? "bg-stone-950 text-white" : "bg-white text-stone-600",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-stone-500">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <DesktopTopNav
        pathname={pathname}
        defaultCollapsed={defaultCollapsed}
        versionLabel={versionLabel}
        onLogout={handleLogout}
        navItems={visibleNavItems}
      />
    </>
  );
}
