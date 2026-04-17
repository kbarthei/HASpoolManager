"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { addToShoppingList } from "@/lib/actions";
import { toast } from "sonner";

interface AddToListButtonProps {
  filamentId: string;
  filamentName: string;
  qty?: number;
}

export function AddToListButton({ filamentId, filamentName, qty = 1 }: AddToListButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      try {
        await addToShoppingList(filamentId, qty);
        toast.success(`${filamentName} added to shopping list`);
        router.refresh();
      } catch {
        toast.error("Failed to add to shopping list");
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 shrink-0"
      onClick={handleClick}
      disabled={isPending}
      title={`Add ${filamentName} to shopping list`}
    >
      <ShoppingCart className="w-3.5 h-3.5" />
    </Button>
  );
}
