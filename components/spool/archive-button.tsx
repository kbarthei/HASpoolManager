"use client";

import { Button } from "@/components/ui/button";
import { archiveSpool } from "@/lib/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";

export function ArchiveButton({ spoolId, spoolName }: { spoolId: string; spoolName: string }) {
  const router = useRouter();

  async function handleArchive() {
    if (!confirm(`Archive "${spoolName}"? It will be moved to the archive.`)) return;
    try {
      await archiveSpool(spoolId);
      toast.success(`Archived ${spoolName}`);
      router.push("/spools");
    } catch {
      toast.error("Failed to archive");
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-destructive border-destructive/30 hover:bg-destructive/10"
      onClick={handleArchive}
    >
      <Archive className="h-3.5 w-3.5 mr-1" /> Archive
    </Button>
  );
}
