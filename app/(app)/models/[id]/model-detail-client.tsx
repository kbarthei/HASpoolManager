"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, AlertTriangle, ShoppingBag, Layers, Clock, Weight, Box } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CompatibilityEntry } from "@/lib/model-file-compatibility";

interface ModelRow {
  id: string;
  filename: string;
  format: string;
  platerName: string | null;
  printerModel: string | null;
  layerHeightMm: number | null;
  nozzleDiameterMm: number | null;
  plateCount: number;
  totalPredictionSeconds: number | null;
  totalWeightGrams: number | null;
  coverPath: string | null;
  uploadedAt: Date;
}

interface FilamentRow {
  id: string;
  plateIndex: number;
  sequenceId: number;
  trayInfoIdx: string | null;
  filamentType: string | null;
  colorHex: string | null;
  usedGrams: number | null;
  usedMeters: number | null;
}

interface LinkedPrint {
  id: string;
  name: string | null;
  status: string;
  startedAt: Date | null;
  printer: { name: string } | null;
}

interface Props {
  model: ModelRow;
  warnings: string[];
  filaments: FilamentRow[];
  compatibility: CompatibilityEntry[];
  linkedPrints: LinkedPrint[];
}

export function ModelDetailClient({ model, warnings, filaments, compatibility, linkedPrints }: Props) {
  async function onAddToShoppingList(filamentType: string | null, colorHex: string | null) {
    if (!filamentType) {
      toast.error("Material unbekannt — nicht zur Wunschliste hinzufügbar");
      return;
    }
    toast.info(`${filamentType} ${colorHex ?? ""} → Wunschliste-Anlage folgt in Phase 2`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link
          href="/models"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Modelle
        </Link>
        <FormatBadge format={model.format} />
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="relative aspect-square w-full bg-muted">
              {model.coverPath ? (
                <Image
                  src={`/api/v1/models/${model.id}/cover`}
                  alt={model.filename}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Box className="h-16 w-16" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="break-words text-lg">
              {model.platerName ?? model.filename}
            </CardTitle>
            {model.platerName && (
              <div className="text-xs text-muted-foreground">{model.filename}</div>
            )}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {warnings.length > 0 && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700 dark:text-yellow-300"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <strong>Hinweise beim Parse:</strong> {warnings.join(", ")}
                </div>
              </div>
            )}
            <ModeExplanation format={model.format} />
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
              {model.printerModel && (
                <>
                  <dt className="text-muted-foreground">Drucker</dt>
                  <dd>{model.printerModel}</dd>
                </>
              )}
              {model.layerHeightMm !== null && (
                <>
                  <dt className="text-muted-foreground">Layer</dt>
                  <dd>{model.layerHeightMm} mm</dd>
                </>
              )}
              {model.nozzleDiameterMm !== null && (
                <>
                  <dt className="text-muted-foreground">Düse</dt>
                  <dd>{model.nozzleDiameterMm} mm</dd>
                </>
              )}
              <dt className="text-muted-foreground">
                <Layers className="mr-1 inline h-3 w-3" />
                Plates
              </dt>
              <dd>{model.plateCount}</dd>
              {model.totalPredictionSeconds !== null && (
                <>
                  <dt className="text-muted-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />
                    Druckzeit
                  </dt>
                  <dd>{formatDuration(model.totalPredictionSeconds)}</dd>
                </>
              )}
              {model.totalWeightGrams !== null && (
                <>
                  <dt className="text-muted-foreground">
                    <Weight className="mr-1 inline h-3 w-3" />
                    Gewicht
                  </dt>
                  <dd>{model.totalWeightGrams.toFixed(0)} g</dd>
                </>
              )}
              <dt className="text-muted-foreground">Hochgeladen</dt>
              <dd>{new Date(model.uploadedAt).toLocaleString("de-DE")}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filamente {filaments.length > 0 ? `(${filaments.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {filaments.length === 0 ? (
            <div className="text-sm text-muted-foreground">Keine Filament-Daten gefunden.</div>
          ) : (
            <ul className="space-y-3">
              {compatibility.map((entry, idx) => (
                <li key={entry.filamentSlotId} data-testid={`compat-row-${idx}`} className="rounded-md border p-3">
                  <FilamentRow entry={entry} onAddToList={onAddToShoppingList} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {linkedPrints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drucke mit diesem Modell ({linkedPrints.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {linkedPrints.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/prints/${p.id}`} className="block truncate text-sm font-medium hover:underline">
                      {p.name ?? p.id.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.printer?.name} · {p.startedAt ? new Date(p.startedAt).toLocaleString("de-DE") : "—"}
                    </div>
                  </div>
                  <Badge variant={p.status === "finished" ? "default" : "secondary"}>{p.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FilamentRow({
  entry,
  onAddToList,
}: {
  entry: CompatibilityEntry;
  onAddToList: (filamentType: string | null, colorHex: string | null) => void;
}) {
  const { required, matches } = entry;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ColorDot hex={required.colorHex} />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {required.type ?? "Unbekannt"}
              {required.colorHex && <span className="ml-2 text-xs text-muted-foreground">{required.colorHex}</span>}
              {required.trayInfoIdx && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  {required.trayInfoIdx}
                </Badge>
              )}
            </div>
            {required.usedGrams !== null && (
              <div className="text-xs text-muted-foreground">
                Bedarf: {required.usedGrams.toFixed(1)} g · Plate {entry.plateIndex} · Slot {entry.sequenceId}
              </div>
            )}
          </div>
        </div>
        {matches.length === 0 && (
          <Button size="sm" variant="outline" onClick={() => onAddToList(required.type, required.colorHex)}>
            <ShoppingBag className="mr-1 h-3.5 w-3.5" />
            Wunschliste
          </Button>
        )}
      </div>

      {matches.length > 0 ? (
        <ul className="space-y-1 pl-7 text-xs">
          {matches.map((m) => (
            <li key={m.spoolId} className="flex items-center gap-2">
              <span className="text-emerald-600">✓</span>
              <Link href={`/spools?spool=${m.spoolId}`} className="hover:underline">
                <strong>{m.filamentName}</strong>
              </Link>
              <span className="text-muted-foreground">·</span>
              <span>{m.remainingWeight}g</span>
              <span className="text-muted-foreground">·</span>
              <span>{m.inAms ? "AMS" : m.location}</span>
              <Badge variant="outline" className="ml-1 text-[10px]">
                {m.matchedBy === "trayInfoIdx" ? "RFID" : "Material"}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pl-7 text-xs text-red-600 dark:text-red-400">Keine passende Spule verfügbar</div>
      )}
    </div>
  );
}

function ColorDot({ hex }: { hex: string | null }) {
  const safe = hex && /^#[0-9A-F]{6}$/i.test(hex) ? hex : null;
  return (
    <span
      className="inline-block h-5 w-5 shrink-0 rounded-full border border-border"
      style={safe ? { backgroundColor: safe } : { backgroundColor: "transparent" }}
      aria-hidden="true"
    />
  );
}

function FormatBadge({ format }: { format: string }) {
  if (format === "old") {
    return (
      <Badge variant="default" className="bg-emerald-600 text-white">
        Full Mode (Zeit + Gewicht)
      </Badge>
    );
  }
  if (format === "new") {
    return (
      <Badge variant="default" className="bg-blue-600 text-white">
        Material-Plan (kein Zeit/Gewicht)
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-muted">
      Geometry-Only
    </Badge>
  );
}

function ModeExplanation({ format }: { format: string }) {
  if (format === "new") {
    return (
      <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
        Bambu-Studio-Project-Mode (FW ≥ 02.06): Zeit/Gewicht/Kosten nur nach{" "}
        <strong>&quot;Export Sliced 3MF&quot;</strong> (mit eingebettetem G-code).
      </div>
    );
  }
  if (format === "geometry-only") {
    return (
      <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
        Reine Geometrie ohne Slicer-Metadaten. Bitte erst in Bambu Studio / OrcaSlicer slicen.
      </div>
    );
  }
  return null;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
