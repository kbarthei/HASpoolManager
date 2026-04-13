"use client";

import { useState } from "react";
import { ChevronDown, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AnalyticsSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full py-2 text-left group"
      >
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Analytics
        </span>
        <div className="flex-1 h-px bg-border" />
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="space-y-2 animate-fade-in-up">{children}</div>}
    </div>
  );
}
