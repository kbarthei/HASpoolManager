import { AmsSlotCard } from "@/components/ams/ams-slot-card";

interface SlotSpool {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  status: string;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
}

interface SlotData {
  id: string;
  slotType: string;
  amsIndex: number;
  trayIndex: number;
  isEmpty: boolean;
  bambuRemain: number;
  spool?: SlotSpool | null;
}

interface AmsSectionProps {
  label: string;
  slots: SlotData[];
  onClickSpool?: (spoolId: string) => void;
  onClickLoad?: (slotId: string) => void;
  onClickUnload?: (slotId: string) => void;
  onClickArchive?: (spoolId: string) => void;
}

/**
 * Horizontal grid of AMS slot chips. Always `grid-cols-2 md:grid-cols-4` so
 * AMS (4 slots), AMS HT (1 slot), and External (1 slot) all share the same
 * cell geometry and single-slot sections visually align with the 4-slot row
 * above them.
 */
export function AmsSection({
  label,
  slots,
  onClickSpool,
  onClickLoad,
  onClickUnload,
  onClickArchive,
}: AmsSectionProps) {
  return (
    <div className="space-y-2">
      <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {slots.map((slot) => (
          <AmsSlotCard
            key={slot.id}
            slot={slot}
            onClickSpool={onClickSpool}
            onClickLoad={onClickLoad}
            onClickUnload={onClickUnload}
            onClickArchive={onClickArchive}
          />
        ))}
      </div>
    </div>
  );
}
