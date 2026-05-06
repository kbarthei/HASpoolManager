import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { modelFiles, modelFileFilaments, prints } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { computeCompatibility } from "@/lib/model-file-compatibility";
import { ModelDetailClient } from "./model-detail-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ModelDetailPage({ params }: PageProps) {
  const { id } = await params;

  const model = await db.query.modelFiles.findFirst({
    where: eq(modelFiles.id, id),
  });
  if (!model) notFound();

  const filaments = await db
    .select()
    .from(modelFileFilaments)
    .where(eq(modelFileFilaments.modelFileId, id));

  const compatibility = await computeCompatibility(id);

  const linkedPrints = await db.query.prints.findMany({
    where: eq(prints.modelFileId, id),
    orderBy: [desc(prints.startedAt)],
    limit: 20,
    with: { printer: true },
  });

  let warnings: string[] = [];
  if (model.parseWarnings) {
    try {
      const parsed = JSON.parse(model.parseWarnings);
      if (Array.isArray(parsed)) warnings = parsed.filter((w): w is string => typeof w === "string");
    } catch {
      // ignore
    }
  }

  return (
    <div data-testid="page-model-detail" className="container mx-auto max-w-6xl py-4">
      <ModelDetailClient
        model={model}
        warnings={warnings}
        filaments={filaments}
        compatibility={compatibility}
        linkedPrints={linkedPrints}
      />
    </div>
  );
}
