"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Upload, Box, Trash2, Layers, Clock, Weight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ModelRow {
  id: string;
  filename: string;
  format: string;
  uploadedAt: Date;
  printerModel: string | null;
  layerHeightMm: number | null;
  nozzleDiameterMm: number | null;
  platerName: string | null;
  plateCount: number;
  totalPredictionSeconds: number | null;
  totalWeightGrams: number | null;
  coverPath: string | null;
  parseWarnings: string | null;
}

interface Props {
  initialModels: ModelRow[];
}

export function ModelsClient({ initialModels }: Props) {
  const [models, setModels] = useState<ModelRow[]>(initialModels);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".3mf")) {
        toast.error(`${file.name}: Nur .3mf-Dateien werden akzeptiert`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/v1/models", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(`${file.name}: ${err?.error ?? `${res.status} ${res.statusText}`}`);
          continue;
        }
        const body = (await res.json()) as ModelRow & { deduped?: boolean };
        successCount++;
        if (body.deduped) {
          toast.info(`${file.name}: Existiert bereits — verlinkt`);
        } else {
          toast.success(`${file.name}: Hochgeladen`);
        }
        setModels((prev) => {
          if (prev.some((m) => m.id === body.id)) return prev;
          return [body, ...prev];
        });
      } catch (err) {
        toast.error(`${file.name}: ${(err as Error).message}`);
      }
    }
    setUploading(false);
    if (successCount > 0) {
      startTransition(() => router.refresh());
    }
  }, [router]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }, [handleFiles]);

  const onDelete = useCallback(async (id: string) => {
    if (!confirm("Modell wirklich löschen?")) return;
    const res = await fetch(`/api/v1/models/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(err?.error ?? `${res.status} ${res.statusText}`);
      return;
    }
    setModels((prev) => prev.filter((m) => m.id !== id));
    toast.success("Modell gelöscht");
  }, []);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Modelle</h1>
          <p className="text-sm text-muted-foreground">
            3MF-Dateien aus Bambu Studio / Orca hochladen — Cover, Filamente, Spool-Match auf einen Blick.
          </p>
        </div>
      </header>

      <div
        data-testid="models-dropzone"
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
        } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <Upload className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
        <div className="text-sm font-medium">3MF hierher ziehen oder klicken</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Bambu Studio / OrcaSlicer Project- oder Sliced-Files. Max. 150 MB pro Datei.
        </div>
        <label className="mt-3 inline-block cursor-pointer">
          <input
            type="file"
            accept=".3mf"
            multiple
            className="hidden"
            onChange={onPick}
            data-testid="models-file-input"
          />
          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[0.8rem] hover:bg-muted">
            {uploading ? "Lade hoch …" : "Datei wählen"}
          </span>
        </label>
      </div>

      {models.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Noch keine Modelle. Lade dein erstes 3MF oben hoch.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <ModelCard key={m.id} model={m} onDelete={() => onDelete(m.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelCard({ model, onDelete }: { model: ModelRow; onDelete: () => void }) {
  const hasWarnings = (() => {
    if (!model.parseWarnings) return false;
    try {
      const w = JSON.parse(model.parseWarnings);
      return Array.isArray(w) && w.length > 0;
    } catch {
      return false;
    }
  })();

  return (
    <Card data-testid={`model-card-${model.id}`} className="overflow-hidden">
      <Link href={`/models/${model.id}`}>
        <div className="relative aspect-square w-full bg-muted">
          {model.coverPath ? (
            <Image
              src={`/api/v1/models/${model.id}/cover`}
              alt={model.filename}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-contain"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Box className="h-12 w-12" />
            </div>
          )}
          <div className="absolute right-2 top-2 flex gap-1">
            <FormatBadge format={model.format} />
            {hasWarnings && (
              <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">
                <AlertTriangle className="mr-1 h-3 w-3" />
              </Badge>
            )}
          </div>
        </div>
      </Link>

      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/models/${model.id}`} className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{model.platerName ?? model.filename}</div>
            {model.platerName && (
              <div className="truncate text-xs text-muted-foreground">{model.filename}</div>
            )}
          </Link>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onDelete}
            aria-label="Modell löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {model.plateCount} Plate{model.plateCount === 1 ? "" : "s"}
          </span>
          {model.totalPredictionSeconds !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(model.totalPredictionSeconds)}
            </span>
          )}
          {model.totalWeightGrams !== null && (
            <span className="inline-flex items-center gap-1">
              <Weight className="h-3 w-3" />
              {model.totalWeightGrams.toFixed(0)}g
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FormatBadge({ format }: { format: string }) {
  if (format === "old") {
    return (
      <Badge variant="default" className="bg-emerald-600 text-white">
        Full
      </Badge>
    );
  }
  if (format === "new") {
    return (
      <Badge variant="default" className="bg-blue-600 text-white">
        Material
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-muted">
      Geometry
    </Badge>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
