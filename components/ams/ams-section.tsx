import { AmsSlotCard } from "@/components/ams/ams-slot-card";

interface SlotSpool {
  id: string;
  remainingWeight: number;
  initialWeight: number;
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

export function AmsSection({ label, slots, onClickSpool, onClickLoad, onClickUnload, onClickArchive }: AmsSectionProps) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium px-0.5">
        {label}
      </div>
      <div className="flex flex-col gap-1.5">
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
