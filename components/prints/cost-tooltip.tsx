"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CostTooltipProps {
  text: string | undefined;
  children: React.ReactNode;
}

/**
 * Wraps a cost value with a shadcn/ui Tooltip showing the filament/electricity breakdown.
 * If `text` is undefined, renders children as-is (no tooltip).
 */
export function CostTooltip({ text, children }: CostTooltipProps) {
  if (!text) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          {children}
        </TooltipTrigger>
        <TooltipContent>
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
