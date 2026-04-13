"use client";

import { useState, useEffect } from "react";
import { Droplets } from "lucide-react";

interface DryingUnit {
  name: string;
  isDrying: boolean;
  remainingHours: number;
}

export function AmsDryingStatus() {
  const [units, setUnits] = useState<DryingUnit[]>([]);

  useEffect(() => {
    const base = window.location.pathname.includes("/ingress/")
      ? window.location.pathname.split("/ingress/")[0] + "/ingress"
      : "";

    async function fetchDrying() {
      try {
        const res = await fetch(`${base}/api/v1/admin/ams-drying`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.available && data.units) {
          setUnits(data.units.filter((u: DryingUnit) => u.isDrying));
        }
      } catch { /* expected when HA API not available */ }
    }

    fetchDrying();
    const interval = setInterval(fetchDrying, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (units.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
      <Droplets className="h-4 w-4 text-blue-500 shrink-0" />
      <div className="text-sm">
        {units.map((u) => (
          <span key={u.name}>
            <span className="font-medium">{u.name}</span>
            {" drying"}
            {u.remainingHours > 0 && (
              <span className="text-muted-foreground">
                {" — "}{u.remainingHours.toFixed(1)}h remaining
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
