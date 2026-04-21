interface StatCell {
  label: string;
  value: string;
  sub?: string | null;
}

interface SpoolStatsRowProps {
  used: StatCell;
  costPerG: StatCell;
  paid: StatCell;
}

/**
 * Three-up stats row below the Remaining card.
 * Layout per cell: label (2xs uppercase muted), value (17/700), sub (2xs muted).
 */
export function SpoolStatsRow({ used, costPerG, paid }: SpoolStatsRowProps) {
  const cells = [used, costPerG, paid];
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {cells.map((c) => (
        <div
          key={c.label}
          className="bg-muted rounded-lg p-3 text-center"
        >
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {c.label}
          </div>
          <div
            className="font-bold tracking-tight leading-tight mt-1"
            style={{ fontSize: "17px" }}
          >
            {c.value}
          </div>
          {c.sub && (
            <div className="text-2xs text-muted-foreground mt-0.5 truncate">
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
