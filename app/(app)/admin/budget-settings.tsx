"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet } from "lucide-react";
import { updateBudgetSettings } from "@/lib/actions";

interface BudgetSettingsProps {
  initialBudget: string;
  initialStartDay: string;
}

export function BudgetSettings({ initialBudget, initialStartDay }: BudgetSettingsProps) {
  const [budget, setBudget] = useState(initialBudget);
  const [startDay, setStartDay] = useState(initialStartDay || "1");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const budgetNum = budget ? parseFloat(budget) : null;
    const startDayNum = startDay ? parseInt(startDay, 10) : 1;

    if (startDayNum < 1 || startDayNum > 28) {
      toast.error("Period start day must be 1-28");
      return;
    }

    startTransition(async () => {
      try {
        await updateBudgetSettings({
          monthlyFilamentBudget: budgetNum,
          budgetPeriodStartDay: startDayNum,
        });
        toast.success("Budget settings saved");
      } catch {
        toast.error("Failed to save budget settings");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-1.5">
          <Label htmlFor="budget-amount" className="text-xs">Monthly Budget (EUR)</Label>
          <Input
            id="budget-amount"
            type="number"
            step="1"
            min="0"
            placeholder="150"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Orders within the period count toward this limit. Leave empty to disable.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget-start-day" className="text-xs">Period Start Day (1-28)</Label>
          <Input
            id="budget-start-day"
            type="number"
            step="1"
            min="1"
            max="28"
            placeholder="1"
            value={startDay}
            onChange={(e) => setStartDay(e.target.value)}
            className="h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            e.g. 1 = calendar month; 25 = runs 25th–24th.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={isPending}
        className="h-7 text-xs"
      >
        <Wallet className="w-3 h-3 mr-1" />
        {isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
