export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { tagMappings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { matchSpool } from "@/lib/matching";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { AlertCircle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;

  // No tag provided — show instructions
  if (!tag) {
    return (
      <div data-testid="page-scan" className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <ScanLine className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-lg font-semibold">Scan a Spool</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Use the iOS Shortcut to scan an NFC tag on a Bambu Lab spool.
          The tag UID will be passed as a URL parameter.
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          /scan?tag=B568B1A400000100
        </p>
      </div>
    );
  }

  // Normalize tag UID (uppercase, strip spaces)
  const tagUid = tag.toUpperCase().replace(/\s/g, "");

  // Try exact RFID match first
  const tagMapping = await db.query.tagMappings.findFirst({
    where: eq(tagMappings.tagUid, tagUid),
    with: {
      spool: {
        with: { filament: { with: { vendor: true } } },
      },
    },
  });

  if (tagMapping?.spool) {
    // Direct match — redirect to spool detail
    redirect(`/spools/${tagMapping.spool.id}`);
  }

  // Try fuzzy match via matching engine
  const matchResult = await matchSpool({ tag_uid: tagUid });

  if (matchResult.match && matchResult.match.confidence >= 0.8) {
    // High confidence match — redirect
    redirect(`/spools/${matchResult.match.spool_id}`);
  }

  // No match or low confidence — show result page
  return (
    <div data-testid="page-scan" className="max-w-md mx-auto py-8 space-y-4">
      <Card className="p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold">Unknown Tag</h2>
            <p className="text-xs text-muted-foreground mt-1">
              No spool found for tag UID:
            </p>
            <p className="text-xs font-mono mt-1 text-foreground">{tagUid}</p>
          </div>
        </div>
      </Card>

      {matchResult.match && (
        <Card className="p-4 rounded-xl">
          <h3 className="text-xs text-muted-foreground mb-2">Best guess ({Math.round(matchResult.match.confidence * 100)}% confidence):</h3>
          <Link href={`/spools/${matchResult.match.spool_id}`} className="text-sm font-medium text-primary hover:underline">
            {matchResult.match.vendor_name} {matchResult.match.filament_name}
          </Link>
          <p className="text-xs text-muted-foreground mt-1">
            {matchResult.match.remaining_weight}g remaining
          </p>
        </Card>
      )}

      {matchResult.candidates.length > 0 && (
        <Card className="p-4 rounded-xl">
          <h3 className="text-xs text-muted-foreground mb-2">Other possibilities:</h3>
          <div className="space-y-2">
            {matchResult.candidates.map((c) => (
              <Link
                key={c.spool_id}
                href={`/spools/${c.spool_id}`}
                className="flex justify-between text-xs hover:text-primary"
              >
                <span>{c.vendor_name} {c.filament_name}</span>
                <span className="text-muted-foreground">{Math.round(c.confidence * 100)}%</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="text-center pt-2">
        <p className="text-xs text-muted-foreground mb-2">
          Want to assign this tag to a spool?
        </p>
        <Link href="/spools">
          <Button variant="outline" size="sm">Browse Spools</Button>
        </Link>
      </div>
    </div>
  );
}
