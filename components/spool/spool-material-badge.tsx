import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getMaterialColor } from "@/lib/theme";

export function SpoolMaterialBadge({
  material,
  className,
}: {
  material: string;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] px-1.5 py-0 font-medium",
        getMaterialColor(material),
        className
      )}
    >
      {material}
    </Badge>
  );
}
