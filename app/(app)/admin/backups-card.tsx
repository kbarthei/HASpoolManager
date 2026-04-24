import { listBackups, DEFAULT_RETENTION_DAYS } from "@/lib/backup-manager";
import { Card } from "@/components/ui/card";
import { BackupsTable } from "./backups-table";

export function BackupsCard() {
  const backups = listBackups().map((b) => ({
    filename: b.filename,
    size: b.size,
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <Card className="p-4 space-y-3" data-testid="admin-backups-card">
      <div>
        <h2 className="text-sm font-semibold">Automated Backups</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Daily 03:00 Europe/Berlin · retention {DEFAULT_RETENTION_DAYS}d · stored in <code className="text-2xs">/config/haspoolmanager/backups/</code>
        </p>
      </div>
      <BackupsTable backups={backups} />
    </Card>
  );
}
