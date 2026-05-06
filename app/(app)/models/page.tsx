import { db } from "@/lib/db";
import { modelFiles } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { ModelsClient } from "./models-client";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const rows = await db.query.modelFiles.findMany({
    orderBy: [desc(modelFiles.uploadedAt)],
    limit: 100,
  });

  return (
    <div data-testid="page-models" className="container mx-auto max-w-6xl py-4">
      <ModelsClient initialModels={rows} />
    </div>
  );
}
