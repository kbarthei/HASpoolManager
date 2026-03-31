"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export function RefreshPricesButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/prices/refresh", { method: "POST" });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      toast.success(`Refreshed ${data.refreshed} price${data.refreshed === 1 ? "" : "s"}`);
      router.refresh();
    } catch {
      toast.error("Failed to refresh prices");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-muted text-foreground border border-border text-xs font-medium hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Refreshing…" : "Refresh Prices"}
    </button>
  );
}
