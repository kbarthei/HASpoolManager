"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SpoolRemainingCard } from "@/components/spool/spool-remaining-card";
import { adjustSpoolWeight } from "@/lib/actions";

interface Props {
  spoolId: string;
  remainingG: number;
  initialG: number;
  estimatedPrintsLeft?: number | null;
  liveRfidPct?: number | null;
}

/**
 * Thin client wrapper so Server Components (e.g. /spools/[id]) can drop in the
 * new Remaining card with its commit-on-release slider. Handles toast + refresh.
 */
export function SpoolRemainingCardEditable({
  spoolId,
  remainingG,
  initialG,
  estimatedPrintsLeft,
  liveRfidPct,
}: Props) {
  const router = useRouter();
  return (
    <SpoolRemainingCard
      remainingG={remainingG}
      initialG={initialG}
      estimatedPrintsLeft={estimatedPrintsLeft}
      liveRfidPct={liveRfidPct}
      onAdjust={async (g) => {
        try {
          await adjustSpoolWeight(spoolId, g);
          toast.success(`Weight updated to ${g}g`);
          router.refresh();
        } catch {
          toast.error("Failed to update weight");
        }
      }}
    />
  );
}
