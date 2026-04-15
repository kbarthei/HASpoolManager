import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MaterialProfileCardProps {
  profile: {
    material: string;
    strength: number | null;
    flexibility: number | null;
    heatResistance: number | null;
    uvResistance: number | null;
    printEase: number | null;
    humiditySensitivity: number | null;
    needsEnclosure: boolean;
    needsHardenedNozzle: boolean;
    isAbrasive: boolean;
    glassTransitionC: number | null;
    density: number | null;
    bestFor: string | null;
    notFor: string | null;
    substitutes: string | null;
    dryingTempC: number | null;
    dryingHours: number | null;
    description: string | null;
  } | null;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return [];
  } catch {
    return [];
  }
}

function RatingBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-20 text-muted-foreground">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "h-2 w-3 rounded-sm",
              i <= value ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{value}/5</span>
    </div>
  );
}

function buildRequirements(profile: NonNullable<MaterialProfileCardProps["profile"]>): string {
  const parts: string[] = [];
  if (profile.needsEnclosure) parts.push("Enclosed printer");
  if (profile.needsHardenedNozzle) parts.push("Hardened nozzle required");
  if (profile.isAbrasive) parts.push("Abrasive");
  if (parts.length === 0) parts.push("Standard setup");
  if (!profile.needsHardenedNozzle) parts.push("Standard nozzle OK");
  return parts.join(" · ");
}

export function MaterialProfileCard({ profile }: MaterialProfileCardProps) {
  if (!profile) return null;

  const bestFor = parseJsonArray(profile.bestFor);
  const notFor = parseJsonArray(profile.notFor);
  const substitutes = parseJsonArray(profile.substitutes);
  const requirements = buildRequirements(profile);

  const ratings: Array<{ label: string; value: number | null }> = [
    { label: "Strength", value: profile.strength },
    { label: "UV Resist", value: profile.uvResistance },
    { label: "Flexibility", value: profile.flexibility },
    { label: "Print Ease", value: profile.printEase },
    { label: "Heat Resist", value: profile.heatResistance },
    { label: "Humidity", value: profile.humiditySensitivity },
  ];

  const hasAnyRating = ratings.some((r) => r.value != null);
  const hasDrying = profile.dryingTempC != null || profile.dryingHours != null;

  return (
    <Card className="p-3 rounded-xl" data-testid="material-profile-card">
      <h3 className="text-sm font-medium mb-2">
        {profile.material} — Material Profile
      </h3>

      {hasAnyRating && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
          {ratings.map((r) => (
            <RatingBar key={r.label} label={r.label} value={r.value} />
          ))}
        </div>
      )}

      <div className="space-y-1 mb-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Requires:</span>{" "}
          {requirements}
        </p>
        {profile.glassTransitionC != null && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Glass transition:</span>{" "}
            {profile.glassTransitionC}°C
          </p>
        )}
        {profile.density != null && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Density:</span>{" "}
            {profile.density} g/cm³
          </p>
        )}
        {hasDrying && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Drying:</span>{" "}
            {profile.dryingTempC != null ? `${profile.dryingTempC}°C` : ""}
            {profile.dryingTempC != null && profile.dryingHours != null ? " · " : ""}
            {profile.dryingHours != null ? `${profile.dryingHours}h` : ""}
          </p>
        )}
      </div>

      {bestFor.length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-medium">Best for: </span>
          <span className="inline-flex flex-wrap gap-1 ml-1">
            {bestFor.map((item) => (
              <Badge key={item} variant="secondary" className="text-xs px-1.5 py-0">
                {item}
              </Badge>
            ))}
          </span>
        </div>
      )}

      {notFor.length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-medium">Not for: </span>
          <span className="inline-flex flex-wrap gap-1 ml-1">
            {notFor.map((item) => (
              <Badge key={item} variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                {item}
              </Badge>
            ))}
          </span>
        </div>
      )}

      {substitutes.length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-medium">Substitutes: </span>
          <span className="inline-flex flex-wrap gap-1 ml-1">
            {substitutes.map((item) => (
              <Badge key={item} variant="outline" className="text-xs px-1.5 py-0">
                {item}
              </Badge>
            ))}
          </span>
        </div>
      )}

      {profile.description && (
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-xs italic text-muted-foreground">
            &ldquo;{profile.description}&rdquo;
          </p>
        </div>
      )}
    </Card>
  );
}
