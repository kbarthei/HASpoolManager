import { Download } from "lucide-react";

interface ExportCsvButtonProps {
  href: string;
  label?: string;
}

export function ExportCsvButton({ href, label = "Export CSV" }: ExportCsvButtonProps) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-2xs font-medium text-muted-foreground hover:text-primary border border-border rounded-md px-2 py-1 hover:bg-accent/20 transition-colors"
      data-testid="export-csv-btn"
      download
    >
      <Download className="w-3 h-3" />
      {label}
    </a>
  );
}
