"use client";

import { Grid2X2, List } from "lucide-react";
import { cn } from "@/lib/utils";

export function ViewToggle({
  view,
  onViewChange,
}: {
  view: "grid" | "list";
  onViewChange: (v: "grid" | "list") => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Grid view"
        onClick={() => onViewChange("grid")}
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-md transition-colors",
          view === "grid"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        <Grid2X2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="List view"
        onClick={() => onViewChange("list")}
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-md transition-colors",
          view === "list"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        <List className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
