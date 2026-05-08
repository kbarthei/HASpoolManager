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

// Match IPv4 like 10.10.35.53 — also accept ongoing input (allow trailing
// dot) for a forgiving onChange. Strict validation happens at save-time.
const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function PrinterRow({ printer }: { printer: PrinterRow }) {
  const [code, setCode] = useState(printer.accessCode ?? "");
  const [ip, setIp] = useState(printer.ipAddress ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCode(printer.accessCode ?? "");
  }, [printer.accessCode]);
  useEffect(() => {
    setIp(printer.ipAddress ?? "");
  }, [printer.ipAddress]);

  const codeDirty = code.trim() !== (printer.accessCode ?? "");
  const ipDirty = ip.trim() !== (printer.ipAddress ?? "");
  const dirty = codeDirty || ipDirty;
  const ipValid = ip.trim() === "" || IPV4_REGEX.test(ip.trim());

  async function onSave() {
    if (!dirty) return;
    if (!ipValid) {
      toast.error("Ungültige IP-Adresse");
      return;
    }
    setSaving(true);
    try {
      const body: { accessCode?: string | null; ipAddress?: string | null } = {};
      if (codeDirty) body.accessCode = code.trim() || null;
      if (ipDirty) body.ipAddress = ip.trim() || null;
      const res = await fetch(`${getApiBase()}/api/v1/printers/${printer.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(errBody?.error ?? `${res.status} ${res.statusText}`);
        return;
      }
      toast.success("Gespeichert");
      startTransition(() => location.reload());
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      // Send BOTH the in-memory IP + code so the test reflects unsaved
      // edits. The endpoint falls back to stored values if either is missing.
      const res = await fetch(`${getApiBase()}/api/v1/printers/${printer.id}/test-ftp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: code.trim(), ipAddress: ip.trim() }),
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
          {printer.accessCode && printer.ipAddress ? (
            <Badge variant="default" className="bg-emerald-600 text-white">
              <Wifi className="h-3 w-3 mr-1" />
              configured
            </Badge>
          ) : (
            <Badge variant="secondary">
              <WifiOff className="h-3 w-3 mr-1" />
              {!printer.ipAddress ? "no IP" : "no code"}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
        <div className="space-y-1">
          <label className="text-2xs uppercase tracking-wider text-muted-foreground">IP Address</label>
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={ip}
            onChange={(e) => setIp(e.target.value.replace(/[^0-9.]/g, "").slice(0, 15))}
            placeholder="10.10.35.53"
            className={`font-mono ${!ipValid ? "border-destructive" : ""}`}
            aria-label={`IP address for ${printer.name}`}
            data-testid={`ip-input-${printer.id}`}
          />
        </div>
        <div className="space-y-1">
          <label className="text-2xs uppercase tracking-wider text-muted-foreground">Access Code</label>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            // Bambu access codes are alphanumeric (e.g. H2S: "27bc0073").
            // Keep only [A-Za-z0-9], preserve original case (printer LCD
            // is case-sensitive). Cap at 12 chars defensively.
            onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 12))}
            placeholder="27bc0073"
            className="font-mono"
            aria-label={`Access code for ${printer.name}`}
            data-testid={`access-code-input-${printer.id}`}
          />
        </div>
        <Button size="sm" onClick={onSave} disabled={!dirty || saving || !ipValid} className="self-end">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onTest}
          disabled={testing || !ip.trim() || !ipValid || code.trim().length < 4}
          className="self-end"
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
