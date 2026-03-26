import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import { getStockLevelColor } from "@/lib/theme";

export default async function SpoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const spool = await db.query.spools.findFirst({
    where: eq(schema.spools.id, id),
    with: {
      filament: { with: { vendor: true } },
      tagMappings: true,
      printUsage: {
        with: { print: true },
        orderBy: (pu, { desc }) => [desc(pu.createdAt)],
      },
    },
  });

  if (!spool) notFound();

  const percent = Math.round((spool.remainingWeight / spool.initialWeight) * 100);
  const usedWeight = spool.initialWeight - spool.remainingWeight;
  const costPerGram = spool.purchasePrice
    ? parseFloat(spool.purchasePrice) / spool.initialWeight
    : 0;

  return (
    <div className="space-y-3 max-w-2xl">
      {/* Hero */}
      <div className="flex items-start gap-4">
        <SpoolColorDot hex={spool.filament.colorHex || "888888"} size="lg" />
        <div>
          <h1 className="text-xl font-bold">{spool.filament.name}</h1>
          <p className="text-sm text-muted-foreground">{spool.filament.vendor.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <SpoolMaterialBadge material={spool.filament.material} />
            {spool.filament.colorHex && (
              <span className="text-xs text-muted-foreground font-mono">
                #{spool.filament.colorHex}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 rounded-xl">
          <div className="text-xs text-muted-foreground">Remaining</div>
          <div className={`text-lg font-bold font-mono ${getStockLevelColor(percent)}`}>
            {spool.remainingWeight}g
          </div>
          <SpoolProgressBar
            remaining={spool.remainingWeight}
            initial={spool.initialWeight}
            className="mt-1"
          />
        </Card>
        <Card className="p-3 rounded-xl">
          <div className="text-xs text-muted-foreground">Used</div>
          <div className="text-lg font-bold font-mono">{usedWeight}g</div>
        </Card>
        <Card className="p-3 rounded-xl">
          <div className="text-xs text-muted-foreground">Cost/g</div>
          <div className="text-lg font-bold font-mono">{costPerGram.toFixed(3)}€</div>
        </Card>
      </div>

      {/* Location + Tag */}
      <Card className="p-3 rounded-xl">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-xs text-muted-foreground">Location</div>
            <div className="text-sm font-medium">{spool.location}</div>
          </div>
          {spool.tagMappings.length > 0 && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">RFID Tag</div>
              <div className="text-xs font-mono">{spool.tagMappings[0].tagUid}</div>
            </div>
          )}
        </div>
      </Card>

      {/* Usage History */}
      <Card className="p-3 rounded-xl">
        <h3 className="text-sm font-medium mb-2">Usage History</h3>
        {spool.printUsage.length === 0 ? (
          <p className="text-xs text-muted-foreground">No usage recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {spool.printUsage.map((usage) => (
              <div
                key={usage.id}
                className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0"
              >
                <div>
                  <span className="font-medium">{usage.print?.name || "Unknown print"}</span>
                  <span className="text-muted-foreground ml-2">
                    {usage.createdAt
                      ? new Date(usage.createdAt).toLocaleDateString("de-DE")
                      : ""}
                  </span>
                </div>
                <div className="font-mono">
                  {usage.weightUsed}g ·{" "}
                  {usage.cost ? `${parseFloat(usage.cost).toFixed(2)}€` : "-"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
