"use client";

import { useState } from "react";
import { purgeAllCaches } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface AdminToolsProps {
  buildInfo: {
    commitSha: string | null;
    deployedAt: string | null;
    runtime: string;
    nodeEnv: string;
  };
}

export function AdminTools({ buildInfo }: AdminToolsProps) {
  const [purging, setPurging] = useState(false);
  const router = useRouter();

  async function handlePurge() {
    setPurging(true);
    try {
      await purgeAllCaches();
      router.refresh();
      toast.success("All page caches purged");
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Build Info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">Commit</span>
          <span className="font-mono">{buildInfo.commitSha || "dev"}</span>
        </div>
        <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">Deployed</span>
          <span className="font-mono">{buildInfo.deployedAt || "local"}</span>
        </div>
        <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">Runtime</span>
          <span className="font-mono">{buildInfo.runtime}</span>
        </div>
        <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">Environment</span>
          <span className="font-mono">{buildInfo.nodeEnv}</span>
        </div>
      </div>

      {/* Purge Cache */}
      <button
        onClick={handlePurge}
        disabled={purging}
        className="flex items-center h-7 px-3 rounded-md bg-muted text-foreground border border-border text-xs font-medium hover:bg-accent transition-colors disabled:opacity-40"
      >
        {purging ? "Refreshing..." : "Refresh All Pages"}
      </button>
    </div>
  );
}
