"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Circle, Package, ShoppingCart, Printer, Clock, Plus, Settings } from "lucide-react";
import { AddOrderDialog } from "@/components/orders/add-order-dialog";

const tabs = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
    isActive: (path: string) => path === "/",
  },
  {
    label: "Spools",
    href: "/spools",
    icon: Circle,
    testId: "nav-spools",
    isActive: (path: string) => path.startsWith("/spools"),
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    testId: "nav-inventory",
    isActive: (path: string) =>
      path.startsWith("/inventory") ||
      path.startsWith("/ams") ||
      path.startsWith("/storage"),
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
        {/* Left: title */}
        <span className="font-semibold text-sm shrink-0">HASpoolManager</span>

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
