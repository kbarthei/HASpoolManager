import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { getFilamentSummary } from "@/lib/queries";

type FilamentSummaryData = Awaited<ReturnType<typeof getFilamentSummary>>;

export function FilamentSummary({ summary }: { summary: FilamentSummaryData }) {
  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Filaments in Stock</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {summary.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active spools</p>
        ) : (
          <div className="flex flex-col gap-2">
            {summary.map(({ vendor, count, materials }) => (
              <div key={vendor}>
                <div className="flex items-center justify-between">
                  <Link
                    href={`/spools?vendor=${encodeURIComponent(vendor)}`}
                    className="text-xs font-medium hover:underline"
                  >
                    {vendor}
                  </Link>
                  <span className="text-xs text-muted-foreground font-mono">
                    {count} spool{count !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {materials.map(m => `${m.material} (${m.count})`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
