import { pillStyleForMaterial } from "@/lib/material-colors";
import { cn } from "@/lib/utils";

interface MaterialPillProps {
  material: string;
  className?: string;
}

export function MaterialPill({ material, className }: MaterialPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold tracking-wide uppercase shrink-0",
        className,
      )}
      style={pillStyleForMaterial(material)}
    >
      {material}
    </span>
  );
}
