export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar - mobile */}
      <header className="sticky top-0 z-50 border-b border-border bg-background px-4 py-3 md:hidden">
        <h1 className="text-lg font-semibold">HASpoolManager</h1>
      </header>

      <div className="flex flex-1">
        {/* Sidebar - desktop */}
        <aside className="hidden w-60 shrink-0 border-r border-border bg-background md:block">
          <div className="p-4">
            <h1 className="text-lg font-semibold">HASpoolManager</h1>
          </div>
          <nav className="space-y-1 px-2">
            {/* Navigation links added in Phase 4 */}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>

      {/* Bottom nav - mobile */}
      <nav className="sticky bottom-0 z-50 border-t border-border bg-background md:hidden">
        <div className="flex h-16 items-center justify-around">
          {/* Navigation icons added in Phase 4 */}
        </div>
      </nav>
    </div>
  );
}
