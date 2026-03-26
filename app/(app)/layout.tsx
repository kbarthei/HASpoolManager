import { TopTabs } from "@/components/layout/top-tabs";
import { BottomNav } from "@/components/layout/bottom-nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopTabs />
      <main className="flex-1 overflow-auto p-3 md:p-4 pb-20 md:pb-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
