import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { prints, modelFiles } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileBox, Image as ImageIcon } from "lucide-react";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { formatDateTime } from "@/lib/date";
import { RetryPullButton } from "./retry-pull-button";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export default async function PrintDetailPage({ params }: PageProps) {
  const { id } = await params;

  const print = await db.query.prints.findFirst({
    where: eq(prints.id, id),
    with: {
      printer: true,
      usage: { with: { spool: { with: { filament: { with: { vendor: true } } } } } },
    },
  });
  if (!print) notFound();

  const model = print.modelFileId
    ? await db.query.modelFiles.findFirst({ where: eq(modelFiles.id, print.modelFileId) })
    : null;

  const totalUsedG = print.usage.reduce((s, u) => s + u.weightUsed, 0);
  const totalCost = Number(print.totalCost ?? 0);

  return (
    <div data-testid="page-print-detail" className="container mx-auto max-w-3xl py-4 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/prints" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          Print History
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {print.name ?? print.gcodeFile ?? "Unnamed print"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDateTime(print.startedAt)}
            {print.printer && ` · ${print.printer.name}`}
            {print.durationSeconds != null && ` · ${formatDuration(print.durationSeconds)}`}
          </p>
        </div>
        <Badge variant={print.status === "finished" ? "default" : "secondary"}>{print.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileBox className="h-4 w-4" />
            Linked 3MF model
          </CardTitle>
        </CardHeader>
        <CardContent>
          {model ? (
            <div className="flex items-start gap-3">
              {model.coverPath && (
                <Link
                  href={`/models/${model.id}`}
                  className="shrink-0 rounded-md border bg-muted overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/v1/models/${model.id}/cover`}
                    alt={model.filename}
                    className="h-20 w-20 object-cover"
                  />
                </Link>
              )}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/models/${model.id}`}
                  className="text-sm font-semibold truncate block hover:underline"
                  data-testid="linked-model-link"
                >
                  {model.filename}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {model.format ?? "3MF"}
                  {model.totalWeightGrams != null && ` · planned ${model.totalWeightGrams.toFixed(1)} g`}
                  {model.totalPredictionSeconds != null &&
                    ` · ${formatDuration(model.totalPredictionSeconds)} predicted`}
                </p>
                <div className="mt-2">
                  <RetryPullButton printId={print.id} variant="re-pull" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground flex items-start gap-2">
                <ImageIcon className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  No 3MF linked. The auto-pull may not have found a match — typical when the
                  print was started without a saved Bambu Studio project name (the slicer
                  preset is sent instead). Try a manual re-pull or pass the project filename
                  as an override.
                </span>
              </p>
              <RetryPullButton printId={print.id} variant="pull" />
            </div>
          )}
        </CardContent>
      </Card>

      {print.usage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filament usage</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {print.usage.map((u) => {
                const filament = u.spool?.filament;
                const hex = filament?.colorHex ?? "888888";
                const name = filament
                  ? `${filament.vendor?.name ?? ""} ${filament.material} ${filament.colorName ?? ""}`.trim()
                  : "Unknown spool";
                return (
                  <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <SpoolColorDot hex={hex} size="sm" />
                      <span className="text-sm truncate">{name}</span>
                      {filament && <SpoolMaterialBadge material={filament.material} />}
                    </div>
                    <span className="text-sm font-mono tabular-nums shrink-0">
                      {u.weightUsed.toFixed(2)} g
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t pt-2 mt-2 text-sm">
              <span className="font-semibold">Total</span>
              <span className="font-mono tabular-nums">
                {totalUsedG.toFixed(2)} g
                {totalCost > 0 && ` · €${totalCost.toFixed(2)}`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {print.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{print.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
