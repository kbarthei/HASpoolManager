"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AmsSection } from "@/components/ams/ams-section";
import { SpoolDetailSheet } from "@/components/spool/spool-detail-sheet";
import { SpoolPicker } from "@/components/spool/spool-picker";
import { archiveSpool, loadSpoolToSlot, unloadSlotSpool } from "@/lib/actions";
import { toast } from "sonner";

interface SlotData {
  id: string;
  slotType: string;
  amsIndex: number;
  trayIndex: number;
  isEmpty: boolean;
  bambuRemain: number;
  spool?: {
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
  } | null;
}

interface AmsClientProps {
  initialSlots: SlotData[];
  printerId: string;
}

export function AmsClient({ initialSlots, printerId }: AmsClientProps) {
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: slots } = useQuery({
    queryKey: ["ams-slots"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/printers/${printerId}`);
      if (!res.ok) return initialSlots;
      const printer = await res.json();
      return printer.amsSlots || [];
    },
    initialData: initialSlots,
    refetchInterval: 30000,
  });

  const typedSlots = slots as SlotData[];
  const groupedSlots = typedSlots.reduce<Record<string, SlotData[]>>((acc, slot) => {
    const key: string = slot.slotType ?? "ams";
    if (!acc[key]) acc[key] = [];
    acc[key].push(slot);
    return acc;
  }, {});

  const sectionLabel = (type: string, count: number): string => {
    if (type === "ams") return `AMS · ${count} Slot${count !== 1 ? "s" : ""}`;
    if (type === "ams_ht") return `AMS HT · ${count} Slot${count !== 1 ? "s" : ""}`;
    return "External";
  };

  const handleClickSpool = (spoolId: string) => {
    setSelectedSpoolId(spoolId);
    setSheetOpen(true);
  };

  const handleClickLoad = (slotId: string) => {
    setSelectedSlotId(slotId);
    setPickerOpen(true);
  };

  const handleClickUnload = async (slotId: string) => {
    try {
      await unloadSlotSpool(slotId);
    } catch (err) {
      console.error("Failed to unload slot:", err);
    }
  };

  const handleClickArchive = async (spoolId: string) => {
    try {
      await archiveSpool(spoolId);
      const spool = typedSlots.find(s => s.spool?.id === spoolId)?.spool;
      toast.success(spool ? `Archived ${spool.filament.vendor.name} ${spool.filament.name}` : "Spool archived");
    } catch {
      toast.error("Failed to archive spool");
    }
  };

  const handlePickerSelect = async (spoolId: string) => {
    if (!selectedSlotId) return;
    try {
      await loadSpoolToSlot(selectedSlotId, spoolId);
    } catch (err) {
      console.error("Failed to load spool:", err);
    } finally {
      setSelectedSlotId(null);
    }
  };

  const sectionOrder = ["ams", "ams_ht", "external"];

  return (
    <div className="space-y-5">
      {sectionOrder
        .filter((type) => groupedSlots[type]?.length > 0)
        .map((type) => {
          const typeSlots = groupedSlots[type];
          return (
            <AmsSection
              key={type}
              label={sectionLabel(type, typeSlots.length)}
              slots={typeSlots}
              onClickSpool={handleClickSpool}
              onClickLoad={handleClickLoad}
              onClickUnload={handleClickUnload}
              onClickArchive={handleClickArchive}
            />
          );
        })}

      <SpoolDetailSheet
        spoolId={selectedSpoolId}
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setSelectedSpoolId(null);
        }}
      />

      <SpoolPicker
        open={pickerOpen}
        onSelect={handlePickerSelect}
        onClose={() => {
          setPickerOpen(false);
          setSelectedSlotId(null);
        }}
      />
    </div>
  );
}
