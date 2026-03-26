"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Circle, Cpu, Grid3X3 } from "lucide-react";

const tabs = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    isActive: (path: string) => path === "/",
  },
  {
    label: "Spools",
    href: "/spools",
    icon: Circle,
    isActive: (path: string) => path.startsWith("/spools"),
  },
  {
    label: "AMS",
    href: "/ams",
    icon: Cpu,
    isActive: (path: string) => path.startsWith("/ams"),
  },
  {
    label: "Storage",
    href: "/storage",
    icon: Grid3X3,
    isActive: (path: string) => path.startsWith("/storage"),
  },
];

export function TopTabs() {
  const pathname = usePathname();

  return (
    <header className="hidden md:flex h-12 items-center justify-between bg-card border-b border-border px-4">
      {/* Left: title */}
      <span className="font-semibold text-sm shrink-0">HASpoolManager</span>

      {/* Center: tabs */}
      <nav className="flex items-center gap-1">
        {tabs.map(({ label, href, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 h-12 text-sm transition-colors ${
                active
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right: search placeholder */}
      <span className="text-xs text-muted-foreground shrink-0">⌘K</span>
    </header>
  );
}
