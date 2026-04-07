export const dynamic = "force-dynamic";

import { getAllPrintUsage, getAllSpools } from "@/lib/queries";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { Printer, Package } from "lucide-react";
import { formatTime, formatDateLong } from "@/lib/date";

// ── Types ─────────────────────────────────────────────────────────────────

type HistoryEvent =
  | {
      type: "print_usage";
      id: string;
      date: Date;
      weightUsed: number;
      filamentName: string;
      colorHex: string;
      printName: string;
    }
  | {
      type: "spool_added";
      id: string;
      date: Date;
      filamentName: string;
      colorHex: string;
    };

// ── Helpers ────────────────────────────────────────────────────────────────

function groupByDate(events: HistoryEvent[]): Map<string, HistoryEvent[]> {
  const map = new Map<string, HistoryEvent[]>();
  for (const ev of events) {
    const key = formatDateLong(ev.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return map;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function SpoolHistoryPage() {
  const [usageRows, spools] = await Promise.all([getAllPrintUsage(), getAllSpools()]);

  // Build unified event list
  const events: HistoryEvent[] = [];

  for (const u of usageRows) {
    const filament = u.spool?.filament;
    // Use the print's start date (not the usage record creation date)
    // so the history shows when the print actually happened
    const printDate = u.print?.startedAt ? new Date(u.print.startedAt) : new Date(u.createdAt);
    events.push({
      type: "print_usage",
      id: u.id,
      date: printDate,
      weightUsed: u.weightUsed,
      filamentName: filament
        ? `${filament.name} ${filament.colorName ?? ""}`.trim()
        : "Unknown filament",
      colorHex: filament?.colorHex ?? "888888",
      printName: u.print?.name ?? u.print?.gcodeFile ?? "Unnamed Print",
    });
  }

  for (const s of spools) {
    const filament = s.filament;
    events.push({
      type: "spool_added",
      id: s.id,
      date: new Date(s.createdAt),
      filamentName: filament
        ? `${filament.name} ${filament.colorName ?? ""}`.trim()
        : "Unknown filament",
      colorHex: filament?.colorHex ?? "888888",
    });
  }

  // Sort desc by date
  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  const grouped = groupByDate(events);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Spool History</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {events.length} events
        </p>
      </div>

      {/* Timeline */}
      {Array.from(grouped.entries()).map(([dateLabel, dayEvents]) => (
        <section key={dateLabel}>
          {/* Sticky date header */}
          <div className="sticky top-0 z-10 bg-background py-1 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {dateLabel}
            </span>
          </div>

          <div className="border-l border-border ml-2 pl-4 space-y-3">
            {dayEvents.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 relative">
                {/* Dot on timeline line */}
                <div className="absolute -left-[1.375rem] mt-1 h-2 w-2 rounded-full bg-border" />

                {/* Time */}
                <span className="text-xs text-muted-foreground w-10 shrink-0 pt-0.5">
                  {formatTime(ev.date)}
                </span>

                {/* Icon */}
                <div className="shrink-0 pt-0.5">
                  {ev.type === "print_usage" ? (
                    <Printer className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Package className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Description */}
                <div className="flex-1 min-w-0">
                  {ev.type === "print_usage" ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SpoolColorDot hex={ev.colorHex} size="sm" />
                      <span className="text-sm">
                        Used{" "}
                        <span className="font-mono">{ev.weightUsed.toFixed(1)}g</span> of{" "}
                        <span className="font-medium">{ev.filamentName}</span> for{" "}
                        <span className="text-muted-foreground">{ev.printName}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SpoolColorDot hex={ev.colorHex} size="sm" />
                      <span className="text-sm">
                        Added{" "}
                        <span className="font-medium">{ev.filamentName}</span> to inventory
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {events.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">No history yet.</p>
      )}
    </div>
  );
}
