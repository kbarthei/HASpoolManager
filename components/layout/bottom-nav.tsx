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

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-14 items-center justify-around">
        {tabs.map(({ label, href, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {active && <span>{label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
