"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { cn } from "@/lib/utils";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplyRule {
  id: string;
  filamentId: string | null;
  material: string | null;
  source: string;
  isConfirmed: boolean;
  minSpools: number;
  maxStockSpools: number;
  isActive: boolean;
  filament?: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor?: { name: string } | null;
  } | null;
  vendor?: { name: string } | null;
  preferredShop?: { name: string } | null;
}

interface FilamentOption {
  id: string;
  name: string;
  material: string;
  colorHex: string | null;
  vendor: { name: string } | null;
}

export interface SupplyRulesProps {
  rules: SupplyRule[];
  filaments: FilamentOption[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isManual(rule: SupplyRule): boolean {
  return rule.source === "manual";
}

function isAutoSuggested(rule: SupplyRule): boolean {
  return rule.source === "auto_suggested" || rule.source === "auto_learned";
}

function ruleLabel(rule: SupplyRule): string {
  if (rule.filament) {
    const vendor = rule.filament.vendor?.name ?? rule.vendor?.name;
    return vendor ? `${vendor} ${rule.filament.name}` : rule.filament.name;
  }
  if (rule.material) {
    return `Any ${rule.material}`;
  }
  return "Unknown rule";
}

function sourceLabel(source: string): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "auto_suggested":
      return "Suggested";
    case "auto_learned":
      return "Learned";
    default:
      return source;
  }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiCreateRule(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/v1/supply/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error ?? "Failed to create rule");
  }
  return true;
}

async function apiUpdateRule(
  id: string,
  body: Record<string, unknown>
): Promise<boolean> {
  const res = await fetch(`/api/v1/supply/rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error ?? "Failed to update rule");
  }
  return true;
}

async function apiDeleteRule(id: string): Promise<boolean> {
  const res = await fetch(`/api/v1/supply/rules/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error ?? "Failed to delete rule");
  }
  return true;
}

// ─── Rule row ─────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onEdit,
  onDelete,
}: {
  rule: SupplyRule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colorHex = rule.filament?.colorHex ?? null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-lg",
        !rule.isActive && "opacity-50"
      )}
      data-testid={`supply-rule-${rule.id}`}
    >
      {colorHex && <SpoolColorDot hex={colorHex} size="sm" />}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">
          {ruleLabel(rule)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {rule.minSpools}–{rule.maxStockSpools} spools
          {rule.preferredShop && ` · ${rule.preferredShop.name}`}
        </span>
      </div>
      <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
        {sourceLabel(rule.source)}
      </Badge>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onEdit}
          aria-label="Edit rule"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label="Delete rule"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Suggestion row ───────────────────────────────────────────────────────────

function SuggestionRow({
  rule,
  onConfirm,
  onDismiss,
  isPending,
}: {
  rule: SupplyRule;
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const colorHex = rule.filament?.colorHex ?? null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20",
        isPending && "opacity-70"
      )}
      data-testid={`supply-suggestion-${rule.id}`}
    >
      <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      {colorHex && <SpoolColorDot hex={colorHex} size="sm" />}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">
          {ruleLabel(rule)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          Keep {rule.minSpools}–{rule.maxStockSpools} spools
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 px-2"
          onClick={onConfirm}
          disabled={isPending}
        >
          <Check className="h-3 w-3" /> Confirm
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] gap-1 px-2 text-muted-foreground"
          onClick={onDismiss}
          disabled={isPending}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Inline add/edit form ─────────────────────────────────────────────────────

interface RuleFormData {
  filamentId: string;
  minSpools: number;
  maxStockSpools: number;
}

function RuleForm({
  filaments,
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  filaments: FilamentOption[];
  initial?: RuleFormData;
  onSave: (data: RuleFormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [filamentId, setFilamentId] = useState(initial?.filamentId ?? "");
  const [minSpools, setMinSpools] = useState(
    String(initial?.minSpools ?? 1)
  );
  const [maxStockSpools, setMaxStockSpools] = useState(
    String(initial?.maxStockSpools ?? 3)
  );

  const handleSubmit = () => {
    if (!filamentId) {
      toast.error("Select a filament");
      return;
    }
    const min = parseInt(minSpools, 10);
    const max = parseInt(maxStockSpools, 10);
    if (isNaN(min) || min < 0) {
      toast.error("Min spools must be 0 or greater");
      return;
    }
    if (isNaN(max) || max < min) {
      toast.error("Max spools must be >= min spools");
      return;
    }
    onSave({ filamentId, minSpools: min, maxStockSpools: max });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="rule-filament" className="text-xs">
          Filament
        </Label>
        <Select value={filamentId} onValueChange={(v) => setFilamentId(v ?? "")}>
          <SelectTrigger id="rule-filament" className="h-8 text-xs">
            <SelectValue placeholder="Select filament…" />
          </SelectTrigger>
          <SelectContent>
            {filaments.map((f) => (
              <SelectItem key={f.id} value={f.id} className="text-xs">
                <span className="flex items-center gap-1.5">
                  <SpoolColorDot hex={f.colorHex ?? "888888"} size="sm" />
                  {f.vendor?.name ? `${f.vendor.name} ` : ""}
                  {f.name} ({f.material})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="rule-min" className="text-xs">
            Min Spools
          </Label>
          <Input
            id="rule-min"
            type="number"
            min={0}
            value={minSpools}
            onChange={(e) => setMinSpools(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="rule-max" className="text-xs">
            Max Stock
          </Label>
          <Input
            id="rule-max"
            type="number"
            min={0}
            value={maxStockSpools}
            onChange={(e) => setMaxStockSpools(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={handleSubmit}
          disabled={isPending}
        >
          <Check className="h-3.5 w-3.5" />
          {initial ? "Save" : "Add Rule"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SupplyRules({ rules, filaments }: SupplyRulesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const manualRules = rules.filter(isManual);
  const suggestions = rules.filter(
    (r) => isAutoSuggested(r) && !r.isConfirmed
  );
  const confirmedAuto = rules.filter(
    (r) => isAutoSuggested(r) && r.isConfirmed
  );

  const handleAdd = (data: RuleFormData) => {
    startTransition(async () => {
      try {
        await apiCreateRule({
          filamentId: data.filamentId,
          source: "manual",
          minSpools: data.minSpools,
          maxStockSpools: data.maxStockSpools,
          isActive: true,
        });
        toast.success("Rule added");
        setShowAddForm(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to create rule"
        );
      }
    });
  };

  const handleUpdate = (id: string, data: RuleFormData) => {
    startTransition(async () => {
      try {
        await apiUpdateRule(id, {
          filamentId: data.filamentId,
          minSpools: data.minSpools,
          maxStockSpools: data.maxStockSpools,
        });
        toast.success("Rule updated");
        setEditingId(null);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update rule"
        );
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await apiDeleteRule(id);
        toast.success("Rule removed");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete rule"
        );
      }
    });
  };

  const handleConfirm = (id: string) => {
    startTransition(async () => {
      try {
        await apiUpdateRule(id, { isConfirmed: true });
        toast.success("Rule confirmed");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to confirm rule"
        );
      }
    });
  };

  const handleDismiss = (id: string) => {
    startTransition(async () => {
      try {
        await apiDeleteRule(id);
        toast.success("Suggestion dismissed");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to dismiss suggestion"
        );
      }
    });
  };

  const editingRule = editingId
    ? rules.find((r) => r.id === editingId)
    : null;

  const totalActive = rules.filter((r) => r.isActive).length;

  return (
    <div data-testid="supply-rules">
      {/* Section header — collapsible */}
      <button
        className="flex items-center gap-2 mb-2 w-full text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        type="button"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            !expanded && "-rotate-90"
          )}
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Supply Rules
        </h3>
        {totalActive > 0 && (
          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {totalActive}
          </span>
        )}
        {suggestions.length > 0 && (
          <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
            {suggestions.length} new
          </span>
        )}
      </button>

      {expanded && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 mb-4 space-y-3">
          {/* Suggestions section */}
          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Suggestions
              </span>
              {suggestions.map((rule) => (
                <SuggestionRow
                  key={rule.id}
                  rule={rule}
                  onConfirm={() => handleConfirm(rule.id)}
                  onDismiss={() => handleDismiss(rule.id)}
                  isPending={isPending}
                />
              ))}
            </div>
          )}

          {/* Manual + confirmed auto rules */}
          {(manualRules.length > 0 || confirmedAuto.length > 0) && (
            <div className="space-y-0.5">
              {[...manualRules, ...confirmedAuto].map((rule) =>
                editingId === rule.id && editingRule ? (
                  <RuleForm
                    key={rule.id}
                    filaments={filaments}
                    initial={{
                      filamentId: editingRule.filamentId ?? "",
                      minSpools: editingRule.minSpools,
                      maxStockSpools: editingRule.maxStockSpools,
                    }}
                    onSave={(data) => handleUpdate(rule.id, data)}
                    onCancel={() => setEditingId(null)}
                    isPending={isPending}
                  />
                ) : (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onEdit={() => setEditingId(rule.id)}
                    onDelete={() => handleDelete(rule.id)}
                  />
                )
              )}
            </div>
          )}

          {/* Empty state */}
          {manualRules.length === 0 &&
            confirmedAuto.length === 0 &&
            suggestions.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <ShieldCheck className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  No supply rules yet. Add rules to get reorder alerts when
                  stock runs low.
                </p>
              </div>
            )}

          {/* Add rule form / button */}
          {showAddForm ? (
            <RuleForm
              filaments={filaments}
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              isPending={isPending}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => setShowAddForm(true)}
              disabled={isPending}
            >
              <Plus className="h-3.5 w-3.5" /> Add Rule
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
