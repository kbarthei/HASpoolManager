"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SpoolFilters } from "@/components/spool/spool-filters";
import { SpoolCard } from "@/components/spool/spool-card";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";

type Spool = {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  location: string | null;
  purchasePrice: string | null;
  currency: string | null;
  status: string;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: {
      name: string;
    };
  };
};

export function SpoolsClient({
  spools,
  materials,
  vendors,
  colors,
  initialView,
}: {
  spools: Spool[];
  materials: string[];
  vendors: string[];
  colors: { hex: string; name: string }[];
  initialView: "grid" | "list";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleViewChange(v: "grid" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", v);
    router.push(`/spools?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SpoolFilters materials={materials} vendors={vendors} colors={colors} />
        <div className="flex items-center gap-2">
          <ViewToggle view={initialView} onViewChange={handleViewChange} />
          <Button size="sm" disabled className="h-7 text-xs px-2.5">
            + Add Spool
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {spools.length === 0 && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          No spools found.
        </div>
      )}

      {/* Grid view */}
      {initialView === "grid" && spools.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {spools.map((spool) => (
            <SpoolCard key={spool.id} spool={spool} />
          ))}
        </div>
      )}

      {/* List view */}
      {initialView === "list" && spools.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">Color</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spools.map((spool) => {
              const colorHex = spool.filament.colorHex ?? "888888";
              return (
                <TableRow
                  key={spool.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/spools/${spool.id}`)}
                >
                  <TableCell>
                    <SpoolColorDot hex={colorHex} size="sm" />
                  </TableCell>
                  <TableCell className="font-medium text-xs">
                    {spool.filament.name}
                  </TableCell>
                  <TableCell>
                    <SpoolMaterialBadge material={spool.filament.material} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {spool.filament.vendor.name}
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    <div className="space-y-1">
                      <SpoolProgressBar
                        remaining={spool.remainingWeight}
                        initial={spool.initialWeight}
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {spool.remainingWeight}g / {spool.initialWeight}g
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {spool.location ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {spool.purchasePrice
                      ? `${spool.purchasePrice} ${spool.currency ?? "EUR"}`
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
