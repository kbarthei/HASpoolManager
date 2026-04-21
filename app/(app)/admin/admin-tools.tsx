"use client";

import { useState } from "react";
import { purgeAllCaches } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

const REPO_URL = "https://github.com/kbarthei/HASpoolManager";

interface AdminToolsProps {
  buildInfo: {
    version: string;
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

  const commitUrl = buildInfo.commitSha ? `${REPO_URL}/commit/${buildInfo.commitSha}` : null;
  const releaseUrl = buildInfo.version !== "dev" ? `${REPO_URL}/releases/tag/v${buildInfo.version}` : null;

  return (
    <div className="space-y-3">
      {/* Build Info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 col-span-2">
          <span className="text-muted-foreground">Version</span>
          {releaseUrl ? (
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-semibold text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              v{buildInfo.version}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-mono font-semibold text-sm">v{buildInfo.version}</span>
          )}
        </div>
        <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">Commit</span>
          {commitUrl ? (
            <a
              href={commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-primary hover:underline inline-flex items-center gap-1"
            >
              {buildInfo.commitSha}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-mono">{buildInfo.commitSha || "dev"}</span>
          )}
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
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="col-span-2 flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 hover:bg-accent transition-colors"
          data-testid="admin-repo-link"
        >
          <span className="text-muted-foreground">Source</span>
          <span className="font-mono text-primary inline-flex items-center gap-1">
            github.com/kbarthei/HASpoolManager
            <ExternalLink className="h-3 w-3" />
          </span>
        </a>
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
