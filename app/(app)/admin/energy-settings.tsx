"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";
import { updateEnergySettings } from "@/lib/actions";

interface EnergySettingsProps {
  initialEntityId: string;
  initialPricePerKwh: string;
}

export function EnergySettings({ initialEntityId, initialPricePerKwh }: EnergySettingsProps) {
  const [entityId, setEntityId] = useState(initialEntityId);
  const [pricePerKwh, setPricePerKwh] = useState(initialPricePerKwh);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await updateEnergySettings({
          energySensorEntityId: entityId.trim() || null,
          electricityPricePerKwh: pricePerKwh ? parseFloat(pricePerKwh) : null,
        });
        toast.success("Energy tracking settings saved");
      } catch {
        toast.error("Failed to save energy settings");
      }
    });
  }

  const isConfigured = entityId.trim().length > 0 && parseFloat(pricePerKwh) > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="energy-entity" className="text-xs">Energy Sensor Entity ID</Label>
          <Input
            id="energy-entity"
            type="text"
            placeholder="sensor.printer_plug_energy"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className="h-8 text-sm font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            HA entity with device_class: energy (cumulative kWh)
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="energy-price" className="text-xs">Electricity Price (EUR/kWh)</Label>
          <Input
            id="energy-price"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.32"
            value={pricePerKwh}
            onChange={(e) => setPricePerKwh(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-end">
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${isConfigured ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
            <span className="text-muted-foreground">
              {isConfigured ? "Configured" : "Not configured"}
            </span>
          </div>
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={isPending}
        className="h-7 text-xs"
      >
        <Zap className="w-3 h-3 mr-1" />
        {isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
