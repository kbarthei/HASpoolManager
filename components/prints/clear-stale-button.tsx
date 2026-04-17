"use client";

import { useState } from "react";
import { clearStaleRunningPrints } from "@/lib/actions";
import { useRouter } from "next/navigation";

interface Props {
  runningCount: number;
}

export function ClearStaleButton({ runningCount }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const router = useRouter();

  async function handleClick() {
    if (runningCount === 0) return;
    setLoading(true);
    try {
      const cleared = await clearStaleRunningPrints();
      setResult(cleared);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result !== null && (
        <span className="text-xs text-muted-foreground">
          Cleared {result}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={loading || runningCount === 0}
        className="flex items-center h-7 px-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium hover:bg-destructive/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Clearing…" : "Clear Stale"}
      </button>
    </div>
  );
}
