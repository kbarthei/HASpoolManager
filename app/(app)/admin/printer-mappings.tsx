"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Check, AlertTriangle, X, Wifi, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Mapping {
  field: string;
  entityId: string;
  originalName: string;
  source: "auto" | "manual";
  status: "ok" | "missing" | "unknown";
  autoEntityId: string | null; // original auto-discovered entity (for reset)
}

interface EntityOption {
  entityId: string;
  originalName: string;
}

interface Printer {
  deviceId: string;
  name: string;
  model: string | null;
  serial: string | null;
  dbPrinterId: string | null;
  dbPrinterName: string | null;
  mappings: Mapping[];
  unmappedCount: number;
  allEntities: EntityOption[];
}

interface MappingsResponse {
  available: boolean;
  reason?: string;
  printers: Printer[];
}

function getApiBase() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.includes("/ingress/")
    ? window.location.pathname.split("/ingress/")[0] + "/ingress"
    : "";
}

export function PrinterMappings() {
  const [data, setData] = useState<MappingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchMappings() {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/v1/admin/printer-mappings`);
      if (!res.ok) {
        setData({ available: false, reason: `HTTP ${res.status}`, printers: [] });
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setData({ available: false, reason: "Not available", printers: [] });
    } finally {
      setLoading(false);
    }
  }

  async function resetOverride(deviceId: string, field: string) {
    setSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/api/v1/admin/printer-mappings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, field }),
      });
      if (res.ok) {
        toast.success(`Reset ${field} to auto`);
        fetchMappings();
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function saveOverride(deviceId: string, field: string, entityId: string) {
    setSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/api/v1/admin/printer-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, field, entityId }),
      });
      if (res.ok) {
        toast.success(`Mapped ${field} → ${entityId.split(".").pop()}`);
        setEditingRow(null);
        fetchMappings();
      } else {
        toast.error("Failed to save override");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    fetchMappings();
  }, []);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Discovering printers...
        </div>
      </Card>
    );
  }

  if (!data?.available) {
    return (
      <Card className="p-4 space-y-2">
        <h2 className="text-sm font-semibold">Sync Worker</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wifi className="h-3.5 w-3.5" />
          {data?.reason || "Not available"}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Sync Worker — Printer Discovery</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={fetchMappings}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Re-Discover
        </Button>
      </div>

      {data.printers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No Bambu Lab printers found. Is the bambu_lab integration installed?
        </p>
      ) : (
        data.printers.map((printer) => {
          const okCount = printer.mappings.filter((m) => m.status === "ok").length;
          const missingCount = printer.mappings.filter((m) => m.status === "missing").length;
          const isExpanded = expanded === printer.deviceId;

          return (
            <div key={printer.deviceId} className="space-y-2">
              {/* Printer header */}
              <button
                className="w-full flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 hover:bg-muted/50 transition text-left"
                onClick={() => setExpanded(isExpanded ? null : printer.deviceId)}
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] h-5 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  >
                    connected
                  </Badge>
                  <span className="text-sm font-medium">{printer.model || printer.name}</span>
                  {printer.dbPrinterName && (
                    <span className="text-xs text-muted-foreground">
                      → DB: {printer.dbPrinterName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Check className="h-3 w-3 text-emerald-500" />
                    {okCount}
                  </span>
                  {missingCount > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-500">
                      <AlertTriangle className="h-3 w-3" />
                      {missingCount}
                    </span>
                  )}
                  <span>{printer.unmappedCount} ignored</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </button>

              {/* Expanded: entity mapping table */}
              {isExpanded && (
                <div className="rounded-lg border border-border overflow-hidden ml-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-3 py-1.5 font-medium">Field</th>
                        <th className="text-left px-3 py-1.5 font-medium">Entity</th>
                        <th className="text-left px-3 py-1.5 font-medium">Name</th>
                        <th className="text-center px-3 py-1.5 font-medium w-16">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {printer.mappings.map((m) => (
                        <tr key={m.field} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono">{m.field}</td>
                          <td className="px-3 py-1.5">
                            {editingRow === m.field ? (
                              <select
                                className="w-full bg-background border border-input rounded px-1.5 py-0.5 text-xs font-mono"
                                defaultValue={m.entityId}
                                disabled={saving}
                                onChange={(e) => {
                                  if (e.target.value !== m.entityId) {
                                    saveOverride(printer.deviceId, m.field, e.target.value);
                                  } else {
                                    setEditingRow(null);
                                  }
                                }}
                                onBlur={() => !saving && setEditingRow(null)}
                                autoFocus
                              >
                                {printer.allEntities.map((opt) => (
                                  <option key={opt.entityId} value={opt.entityId}>
                                    {opt.entityId} ({opt.originalName})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <button
                                className="font-mono text-muted-foreground hover:text-foreground hover:underline text-left truncate max-w-[250px] block"
                                onClick={() => setEditingRow(m.field)}
                                title="Click to change entity"
                              >
                                {m.entityId}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{m.originalName}</td>
                          <td className="px-3 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {m.status === "ok" ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : m.status === "missing" ? (
                                <X className="h-3.5 w-3.5 text-red-500" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              )}
                              {m.source === "manual" && (
                                <button
                                  className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30 hover:bg-amber-500/25 transition"
                                  title={`Manual override (auto: ${m.autoEntityId}). Click to reset.`}
                                  onClick={() => resetOverride(printer.deviceId, m.field)}
                                  disabled={saving}
                                >
                                  manual
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </Card>
  );
}
