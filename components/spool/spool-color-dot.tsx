import { cn } from "@/lib/utils";
import { needsRing } from "@/lib/theme";

const sizes = {
  sm: "h-4 w-4",     // 16px
  md: "h-5 w-5",     // 20px
  lg: "h-20 w-20",   // 80px
} as const;

export function SpoolColorDot({
  hex,
  size = "md",
  className,
}: {
  hex: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const clean = hex.replace("#", "");
  return (
    <div
      className={cn(
        "rounded-full shrink-0",
        sizes[size],
        needsRing(clean) && "ring-1 ring-gray-400 dark:ring-gray-600",
        className
      )}
      style={{ backgroundColor: `#${clean}` }}
    />
  );
}
