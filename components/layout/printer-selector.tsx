"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cpu } from "lucide-react";

interface Printer {
  id: string;
  name: string;
  model: string;
  isActive: boolean;
}

export function PrinterSelector({
  printers,
  currentPrinterId,
}: {
  printers: Printer[];
  currentPrinterId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Don't show if only one printer
  if (printers.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Cpu className="h-3 w-3" />
        <span>{printers[0]?.name || "No Printer"}</span>
      </div>
    );
  }

  function handleChange(printerId: string | null) {
    if (!printerId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("printer", printerId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <Cpu className="h-3 w-3 text-muted-foreground" />
      <Select value={currentPrinterId} onValueChange={handleChange}>
        <SelectTrigger className="h-7 text-xs w-auto border-none bg-transparent p-0 pr-6">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {printers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} ({p.model})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
