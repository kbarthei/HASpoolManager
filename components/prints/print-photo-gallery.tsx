"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Trash2, Upload, Camera } from "lucide-react";
import { uploadPrintPhotoAction, deletePrintPhotoAction, captureCoverNowAction } from "@/lib/actions";

export interface PhotoEntry {
  path: string;
  kind: "cover" | "snapshot" | "user";
  captured_at: string | null;
}

interface PrintPhotoGalleryProps {
  printId: string;
  initialPhotos: PhotoEntry[];
}

const KIND_BADGE: Record<PhotoEntry["kind"], string> = {
  cover: "Cover",
  snapshot: "Snapshot",
  user: "Photo",
};

export function PrintPhotoGallery({ printId, initialPhotos }: PrintPhotoGalleryProps) {
  const [photos, setPhotos] = useState<PhotoEntry[]>(initialPhotos);
  const [lightbox, setLightbox] = useState<PhotoEntry | null>(null);
  const [uploading, startUpload] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function filenameOf(entry: PhotoEntry): string {
    const idx = entry.path.lastIndexOf("/");
    return idx >= 0 ? entry.path.slice(idx + 1) : entry.path;
  }

  function urlFor(entry: PhotoEntry): string {
    const filename = filenameOf(entry);
    return `/api/v1/prints/${printId}/photos/${encodeURIComponent(filename)}`;
  }

  function handleUpload(file: File) {
    startUpload(async () => {
      const body = new FormData();
      body.append("photo", file);
      try {
        const result = await uploadPrintPhotoAction(printId, body);
        if (!result.ok) {
          toast.error(result.error ?? "Upload failed");
          return;
        }
        if (result.photo) {
          setPhotos((prev) => [
            ...prev,
            { path: result.photo!.path, kind: result.photo!.kind as PhotoEntry["kind"], captured_at: result.photo!.captured_at },
          ]);
        }
        toast.success("Photo uploaded");
      } catch {
        toast.error("Upload failed");
      }
    });
  }

  async function handleCaptureCover() {
    startUpload(async () => {
      try {
        const result = await captureCoverNowAction(printId);
        if (!result.ok) {
          toast.error(result.error ?? "Cover capture failed");
          return;
        }
        // optimistic UI update; full state will refresh on next nav
        setPhotos((prev) => [
          ...prev,
          { path: result.savedPath ?? "", kind: "cover", captured_at: new Date().toISOString() },
        ]);
        toast.success("Cover captured");
      } catch {
        toast.error("Cover capture failed");
      }
    });
  }

  async function handleDelete(entry: PhotoEntry) {
    if (!confirm(`Delete this ${entry.kind}?`)) return;
    const filename = filenameOf(entry);
    try {
      const result = await deletePrintPhotoAction(printId, filename);
      if (!result.ok) {
        toast.error(result.error ?? "Delete failed");
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.path !== entry.path));
      toast.success("Photo deleted");
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {photos.length > 0 && (
          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {photos.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => setLightbox(p)}
              className="relative group h-14 w-14 rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
              title={`${KIND_BADGE[p.kind]}${p.captured_at ? ` · ${new Date(p.captured_at).toLocaleString("de-DE")}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urlFor(p)}
                alt={`${KIND_BADGE[p.kind]} for print`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 text-center font-medium uppercase tracking-wider">
                {KIND_BADGE[p.kind]}
              </span>
            </button>
          ))}
          <label className="relative h-14 w-14 rounded-md border-2 border-dashed border-border hover:border-primary transition-colors flex items-center justify-center cursor-pointer text-muted-foreground hover:text-primary">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                if (inputRef.current) inputRef.current.value = "";
              }}
              data-testid={`photo-upload-${printId}`}
            />
            <Upload className="w-4 h-4" />
          </label>
          {!photos.some((p) => p.kind === "cover") && (
            <button
              type="button"
              disabled={uploading}
              onClick={handleCaptureCover}
              className="h-14 w-14 rounded-md border-2 border-dashed border-border hover:border-primary transition-colors flex items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-50"
              title="Cover-Bild jetzt vom Drucker holen"
              data-testid={`capture-cover-${printId}`}
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlFor(lightbox)}
              alt={`${KIND_BADGE[lightbox.kind]} for print`}
              className="max-w-full max-h-[85vh] object-contain rounded"
            />
            <div className="flex items-center justify-between gap-2 mt-3 text-white text-sm">
              <span>
                <strong>{KIND_BADGE[lightbox.kind]}</strong>
                {lightbox.captured_at && (
                  <span className="ml-2 text-white/60">
                    {new Date(lightbox.captured_at).toLocaleString("de-DE")}
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleDelete(lightbox);
                    setLightbox(null);
                  }}
                  className="inline-flex items-center gap-1 text-red-300 hover:text-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="text-white/80 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
