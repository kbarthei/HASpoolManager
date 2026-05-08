"use client";

import { useEffect, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wifi, WifiOff, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface PrinterRow {
  id: string;
  name: string;
  ipAddress: string | null;
  accessCode: string | null;
}

interface Props {
  printers: PrinterRow[];
}

interface TestResult {
  ok: boolean;
  step: string;
  error?: string;
  fileCount?: number;
}

function getApiBase() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.includes("/ingress/")
    ? window.location.pathname.split("/ingress/")[0] + "/ingress"
    : "";
}

export function AccessCodeCard({ printers }: Props) {
  return (
    <Card className="p-4 space-y-4 lg:col-span-2" data-testid="admin-access-code">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5" />
          Bambu Access Code (3MF Auto-Pull)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Wenn der Drucker den Code akzeptiert, holt das Addon nach jedem Druckstart automatisch
          das 3MF aus dem Drucker-Cache und zeigt Cover + Material-Plan in der App.{" "}
          <strong>Cloud, MakerWorld, Mobile-App bleiben unverändert</strong> — der Access Code allein
          schaltet keine Cloud-Funktion ab.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Code finden: <strong>Drucker-LCD → Settings → WLAN → Access Code</strong> (8-stellig).
        </p>
      </div>
      {printers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No printers configured yet.</p>
      ) : (
        <div className="space-y-3">
          {printers.map((p) => (
            <PrinterRow key={p.id} printer={p} />
          ))}
        </div>
      )}
    </Card>
  );
}

function PrinterRow({ printer }: { printer: PrinterRow }) {
  const [code, setCode] = useState(printer.accessCode ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCode(printer.accessCode ?? "");
  }, [printer.accessCode]);

  const dirty = code.trim() !== (printer.accessCode ?? "");

  async function onSave() {
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/api/v1/printers/${printer.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: code.trim() || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? `${res.status} ${res.statusText}`);
        return;
      }
      toast.success("Access Code gespeichert");
      startTransition(() => location.reload());
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${getApiBase()}/api/v1/printers/${printer.id}/test-ftp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: code.trim() }),
      });
      const body = (await res.json()) as TestResult;
      setTestResult(body);
      if (body.ok) toast.success(`Verbunden: ${body.fileCount ?? 0} 3MF-Dateien im Drucker-Cache`);
      else toast.error(body.error ?? `step=${body.step}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <strong>{printer.name}</strong>
          <span className="text-muted-foreground">{printer.ipAddress ?? "(no IP)"}</span>
          {printer.accessCode ? (
            <Badge variant="default" className="bg-emerald-600 text-white">
              <Wifi className="h-3 w-3 mr-1" />
              configured
            </Badge>
          ) : (
            <Badge variant="secondary">
              <WifiOff className="h-3 w-3 mr-1" />
              not set
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
          placeholder="6–8 digit Access Code"
          className="font-mono w-44"
          aria-label={`Access code for ${printer.name}`}
          data-testid={`access-code-input-${printer.id}`}
        />
        <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onTest}
          // Bambu printers historically issued 8-digit access codes; H2 / H2D
          // firmware sometimes shows 6-digit codes (leading zeros stripped).
          // Don't gate on a fixed length — let the FTPS server reject if
          // wrong, and surface the error in the test result.
          disabled={testing || !printer.ipAddress || code.trim().length < 4}
        >
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test connection"}
        </Button>
      </div>

      {testResult && !testResult.ok && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <strong>Schritt: {testResult.step}</strong> — {testResult.error}
          </div>
        </div>
      )}
      {testResult?.ok && (
        <div className="text-xs text-emerald-600 dark:text-emerald-400">
          ✓ FTPS verbunden, Cache-Listing OK ({testResult.fileCount ?? 0} 3MF-Files)
        </div>
      )}
    </div>
  );
}
