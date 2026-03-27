"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Circle, Cpu, Grid3X3, MoreHorizontal, Printer, Clock, ShoppingCart, X } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";

const primaryTabs = [
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

const moreItems = [
  { label: "Orders", href: "/orders", icon: ShoppingCart, isActive: (path: string) => path.startsWith("/orders") },
  { label: "Prints", href: "/prints", icon: Printer, isActive: (path: string) => path.startsWith("/prints") },
  { label: "History", href: "/history", icon: Clock, isActive: (path: string) => path.startsWith("/history") },
];

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isMoreActive = moreItems.some((item) => item.isActive(pathname));

  // Close popover on outside click (external system: DOM events)
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-14 items-center justify-around">
        {primaryTabs.map(({ label, href, icon: Icon, isActive }) => {
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

        {/* More button */}
        <div ref={moreRef} className="flex-1 relative flex flex-col items-center justify-center h-full">
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-col items-center justify-center gap-0.5 w-full h-full text-xs transition-colors ${
              isMoreActive || moreOpen ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {moreOpen ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
            {(isMoreActive || moreOpen) && <span>More</span>}
          </button>

          {/* Popover */}
          {moreOpen && (
            <div className="absolute bottom-full mb-2 right-0 w-44 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              {moreItems.map(({ label, href, icon: Icon, isActive }) => {
                const active = isActive(pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={closeMore}
                    className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted ${
                      active ? "text-primary font-medium" : "text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
