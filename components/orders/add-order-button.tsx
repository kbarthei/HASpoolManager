"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddOrderDialog } from "./add-order-dialog";

export function AddOrderButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
      >
        <Plus className="h-3 w-3" />
        Order
      </Button>

      <AddOrderDialog
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
