"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImportOrderDialog } from "./import-order-dialog";
import { History } from "lucide-react";

interface FilamentData {
  id: string;
  name: string;
  material: string;
  colorName: string | null;
  colorHex: string | null;
  vendor: { name: string };
}

interface SpoolData {
  id: string;
  location: string | null;
  remainingWeight: number;
  initialWeight: number;
  purchasePrice: string | null;
  filament: FilamentData;
}

export function ImportOrdersCard({ allSpools }: { allSpools: SpoolData[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Import Historical Orders</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste a past order email to link existing spools to purchase records and set prices.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            className="shrink-0 h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <History className="h-3.5 w-3.5" />
            Import Order
          </Button>
        </div>
      </Card>

      <ImportOrderDialog
        open={open}
        onClose={() => setOpen(false)}
        allSpools={allSpools}
      />
    </>
  );
}
