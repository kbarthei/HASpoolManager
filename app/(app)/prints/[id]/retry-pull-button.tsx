"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.includes("/ingress/")
    ? window.location.pathname.split("/ingress/")[0] + "/ingress"
    : "";
}

interface Props {
  printId: string;
  variant: "pull" | "re-pull";
}

export function RetryPullButton({ printId, variant }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [override, setOverride] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  async function trigger(printName?: string) {
    setRunning(true);
    try {
      const res = await fetch(`${getApiBase()}/api/v1/prints/${printId}/pull-3mf`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(printName ? { printName } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        modelFileId?: string | null;
        error?: string;
      };
      if (!res.ok) {
        toast.error(body.error ?? `${res.status} ${res.statusText}`);
        return;
      }
      if (body.modelFileId) {
        toast.success("3MF linked");
      } else {
        toast.message(
          "No match found — try the override box and pass the Bambu Studio project filename.",
        );
      }
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={variant === "pull" ? "default" : "outline"}
          onClick={() => trigger()}
          disabled={running || pending}
          data-testid="retry-pull-button"
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          {variant === "pull" ? "Pull 3MF from printer" : "Re-pull 3MF"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowOverride((s) => !s)}
          disabled={running || pending}
        >
          {showOverride ? "Hide override" : "Override match"}
        </Button>
      </div>
      {showOverride && (
        <div className="flex items-center gap-2">
          <Input
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            placeholder="e.g. Plant_Clip_Plant_Support"
            className="text-xs h-8"
            data-testid="retry-pull-override"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => trigger(override.trim() || undefined)}
            disabled={running || pending || !override.trim()}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
