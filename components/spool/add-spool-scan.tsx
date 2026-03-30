"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createSpoolFromScan } from "@/lib/actions";
import { Camera, Upload, Loader2 } from "lucide-react";

type ScanResult = {
  vendor: string | null;
  material: string | null;
  color_name: string | null;
  color_hex: string | null;
  weight: number | null;
  filament_code: string | null;
  name: string | null;
  printing_temp_min: number | null;
  printing_temp_max: number | null;
};

export function AddSpoolScan({ onSuccess }: { onSuccess: () => void }) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  // Editable form state
  const [vendor, setVendor] = useState("");
  const [name, setName] = useState("");
  const [material, setMaterial] = useState("");
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("");
  const [weight, setWeight] = useState(1000);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setImageData(dataUrl);
      setResult(null);
    };
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  }

  async function handleScan() {
    if (!imageData) return;
    setScanning(true);
    try {
      const res = await fetch("/api/v1/spools/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Scan failed");
      }
      const data: ScanResult = await res.json();
      setResult(data);
      setVendor(data.vendor ?? "");
      setName(data.name ?? "");
      setMaterial(data.material ?? "");
      setColorName(data.color_name ?? "");
      setColorHex(data.color_hex ?? "");
      setWeight(data.weight ?? 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleSave() {
    if (!vendor.trim() || !name.trim() || !material.trim()) {
      toast.error("Vendor, name, and material are required");
      return;
    }
    setSaving(true);
    try {
      await createSpoolFromScan({
        vendorName: vendor.trim(),
        filamentName: name.trim(),
        material: material.trim(),
        colorName: colorName.trim() || null,
        colorHex: colorHex.trim() || null,
        weight,
        nozzleTempMin: result?.printing_temp_min ?? null,
        nozzleTempMax: result?.printing_temp_max ?? null,
      });
      toast.success("Spool created from scan");
      onSuccess();
    } catch {
      toast.error("Failed to create spool");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      {!imagePreview && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:border-muted-foreground/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <Upload className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Drag a label photo here or
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5 mr-1" />
              Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="size-3.5 mr-1" />
              Camera
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Preview + scan */}
      {imagePreview && !result && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg border">
            <img
              src={imagePreview}
              alt="Spool label"
              className="w-full max-h-48 object-contain bg-muted"
            />
            <Button
              variant="ghost"
              size="xs"
              className="absolute top-1 right-1"
              onClick={() => {
                setImagePreview(null);
                setImageData(null);
              }}
            >
              Remove
            </Button>
          </div>
          <Button
            className="w-full"
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <Loader2 className="size-3.5 mr-1 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Camera className="size-3.5 mr-1" />
                Scan Label
              </>
            )}
          </Button>
        </div>
      )}

      {/* Result form */}
      {result && (
        <div className="space-y-3">
          {imagePreview && (
            <div className="overflow-hidden rounded-lg border">
              <img
                src={imagePreview}
                alt="Spool label"
                className="w-full max-h-24 object-contain bg-muted"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vendor</label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Material</label>
              <Input value={material} onChange={(e) => setMaterial(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <Input value={colorName} onChange={(e) => setColorName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Hex</label>
              <div className="flex items-center gap-1">
                {colorHex && (
                  <div
                    className="size-5 rounded-full shrink-0 border border-border"
                    style={{ backgroundColor: `#${colorHex.replace("#", "")}` }}
                  />
                )}
                <Input value={colorHex} onChange={(e) => setColorHex(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Weight (g)</label>
              <Input
                type="number"
                value={weight}
                onChange={(e) => setWeight(parseInt(e.target.value) || 1000)}
              />
            </div>
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-3.5 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              "Add Spool"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
