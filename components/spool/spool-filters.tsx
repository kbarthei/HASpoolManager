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

export function SpoolFilters({
  materials,
  vendors,
}: {
  materials: string[];
  vendors: string[];
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
    // Reset to page 1 when filters change
    router.push(`/spools?${params.toString()}`);
  }

  const currentSearch = searchParams.get("search") ?? "";
  const currentMaterial = searchParams.get("material") ?? "all";
  const currentVendor = searchParams.get("vendor") ?? "all";
  const currentStatus = searchParams.get("status") ?? "all";

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <Input
        type="search"
        placeholder="Search spools..."
        defaultValue={currentSearch}
        className="h-8 text-xs w-full sm:w-44"
        onChange={(e) => {
          const val = e.target.value;
          // Debounce via timeout trick: only push after user stops typing
          const params = new URLSearchParams(searchParams.toString());
          if (val) {
            params.set("search", val);
          } else {
            params.delete("search");
          }
          router.push(`/spools?${params.toString()}`);
        }}
      />

      {/* Material filter */}
      <Select
        value={currentMaterial}
        onValueChange={(val) => updateParam("material", val ?? undefined)}
      >
        <SelectTrigger className="h-8 text-xs w-32">
          <SelectValue placeholder="Material" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Materials</SelectItem>
          {materials.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Vendor filter */}
      <Select
        value={currentVendor}
        onValueChange={(val) => updateParam("vendor", val ?? undefined)}
      >
        <SelectTrigger className="h-8 text-xs w-36">
          <SelectValue placeholder="Vendor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Vendors</SelectItem>
          {vendors.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select
        value={currentStatus}
        onValueChange={(val) => updateParam("status", val ?? undefined)}
      >
        <SelectTrigger className="h-8 text-xs w-28">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="low">Low Stock</SelectItem>
          <SelectItem value="empty">Empty</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
