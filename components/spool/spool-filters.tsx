"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";

interface ColorOption {
  hex: string;
  name: string;
}

export function SpoolFilters({
  materials,
  vendors,
  colors,
}: {
  materials: string[];
  vendors: string[];
  colors: ColorOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/spools?${params.toString()}`);
  }

  const currentSearch = searchParams.get("search") ?? "";
  const currentMaterial = searchParams.get("material") ?? "all";
  const currentVendor = searchParams.get("vendor") ?? "all";
  const currentStatus = searchParams.get("status") ?? "all";
  const currentColor = searchParams.get("color") ?? "all";

  return (
    <div className="flex flex-wrap gap-2 items-end">
      {/* Search */}
      <div className="w-full sm:w-44">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
          Search
        </label>
        <Input
          type="search"
          placeholder="Name, vendor, material..."
          defaultValue={currentSearch}
          className="h-8 text-xs"
          onChange={(e) => {
            const val = e.target.value;
            const params = new URLSearchParams(searchParams.toString());
            if (val) {
              params.set("search", val);
            } else {
              params.delete("search");
            }
            router.push(`/spools?${params.toString()}`);
          }}
        />
      </div>

      {/* Material filter */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
          Material
        </label>
        <Select
          value={currentMaterial}
          onValueChange={(val) => updateParam("material", val ?? undefined)}
        >
          <SelectTrigger className="h-8 text-xs w-28">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {materials.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Vendor filter */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
          Vendor
        </label>
        <Select
          value={currentVendor}
          onValueChange={(val) => updateParam("vendor", val ?? undefined)}
        >
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Color filter */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
          Color
        </label>
        <Select
          value={currentColor}
          onValueChange={(val) => updateParam("color", val ?? undefined)}
        >
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="All">
              {currentColor !== "all" && (
                <span className="flex items-center gap-1.5">
                  <SpoolColorDot hex={currentColor} size="sm" />
                  {colors.find((c) => c.hex === currentColor)?.name || currentColor}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Colors</SelectItem>
            {colors.map((c) => (
              <SelectItem key={c.hex} value={c.hex}>
                <span className="flex items-center gap-1.5">
                  <SpoolColorDot hex={c.hex} size="sm" />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status filter */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
          Status
        </label>
        <Select
          value={currentStatus}
          onValueChange={(val) => updateParam("status", val ?? undefined)}
        >
          <SelectTrigger className="h-8 text-xs w-28">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="empty">Empty</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
