"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToShoppingList } from "@/lib/actions";
import { toast } from "sonner";

interface Props {
  filamentId: string;
  filamentName: string;
}

export function AddToShoppingListButton({ filamentId, filamentName }: Props) {
  const [added, setAdded] = useState(false);

  async function handleClick() {
    await addToShoppingList(filamentId);
    setAdded(true);
    toast.success(`Added ${filamentName} to shopping list`);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full gap-1.5"
      onClick={handleClick}
      disabled={added}
    >
      <ShoppingCart className="h-3.5 w-3.5" />
      {added ? "Added!" : "Add to Shopping List"}
    </Button>
  );
}
