"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Circle, Package, ShoppingCart, Printer, Clock, Plus, Settings, BarChart3 } from "lucide-react";
import { AddOrderDialog } from "@/components/orders/add-order-dialog";

// Inlined by next.config.ts at build time from ha-addon/haspoolmanager/config.yaml.
const ADDON_VERSION = process.env.ADDON_VERSION ?? "dev";

const tabs = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
    isActive: (path: string) => path === "/",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    testId: "nav-inventory",
    isActive: (path: string) => path.startsWith("/inventory"),
  },
  {
    label: "Orders",
    href: "/orders",
    icon: ShoppingCart,
    testId: "nav-orders",
    isActive: (path: string) => path.startsWith("/orders"),
  },
  {
    label: "Prints",
    href: "/prints",
    icon: Printer,
    testId: "nav-prints",
    isActive: (path: string) => path.startsWith("/prints"),
  },
  {
    label: "History",
    href: "/history",
    icon: Clock,
    testId: "nav-history",
    isActive: (path: string) => path.startsWith("/history"),
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    testId: "nav-analytics",
    isActive: (path: string) => path.startsWith("/analytics"),
  },
  {
    label: "Spools",
    href: "/spools",
    icon: Circle,
    testId: "nav-spools",
    isActive: (path: string) => path.startsWith("/spools"),
  },
  {
    label: "Admin",
    href: "/admin",
    icon: Settings,
    testId: "nav-admin",
    isActive: (path: string) => path.startsWith("/admin"),
  },
];

export function TopTabs() {
  const pathname = usePathname();
  const [orderOpen, setOrderOpen] = useState(false);

  return (
    <>
      <header className="hidden md:flex h-12 items-center justify-between bg-card border-b border-border px-4">
        {/* Left: icon + title + deployed version */}
        <Link
          href="/"
          className="flex items-baseline gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="HASpoolManager — go to dashboard"
        >
          {/* Teal "S" mark matching app/icon.tsx and app/apple-icon.tsx */}
          <span
            className="self-center h-5 w-5 rounded-[5px] bg-primary text-white flex items-center justify-center font-bold text-[14px] leading-none tracking-[-1px]"
            aria-hidden
          >
            S
          </span>
          <span className="font-semibold text-sm">HASpoolManager</span>
          <span
            className="text-2xs font-mono text-muted-foreground"
            data-testid="header-version"
          >
            v{ADDON_VERSION}
          </span>
        </Link>

        {/* Center: tabs */}
        <nav className="flex items-center gap-0.5">
          {tabs.map(({ label, href, icon: Icon, testId, isActive }) => {
            const active = isActive(pathname);
            return (
              <Link
                key={href}
                href={href}
                data-testid={testId}
                className={`flex items-center gap-1 px-2.5 h-12 text-xs transition-colors ${
                  active
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right: + Order + search hint */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setOrderOpen(true)}
            className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Order
          </button>
          <span className="text-xs text-muted-foreground">⌘K</span>
        </div>
      </header>

      <AddOrderDialog
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
      />
    </>
  );
}
