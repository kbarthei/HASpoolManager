"use client";

import { useState } from "react";
import { ChevronDown, BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AnalyticsSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Card
        data-testid="analytics-toggle"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
        className="rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-accent/50 active:bg-accent/70 transition select-none"
      >
        <BarChart3 className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Analytics</p>
          <p className="text-xs text-muted-foreground">
            {open ? "Tap to collapse" : "10 charts — tap to expand"}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </Card>
      {open && <div className="space-y-2 mt-2 animate-fade-in-up">{children}</div>}
    </div>
  );
}
