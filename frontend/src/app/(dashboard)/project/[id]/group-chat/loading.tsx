import React from "react";
import { Loader2 } from "lucide-react";

export default function GroupChatLoading() {
  return (
    <div className="h-[calc(100vh-3.5rem)] max-h-[calc(100vh-3.5rem)] p-3 sm:p-5 max-w-6xl w-full mx-auto flex flex-col overflow-hidden animate-fade-in">
      <div className="bg-card border border-border rounded-2xl shadow-lg flex flex-col h-full max-h-full min-h-0 overflow-hidden p-4 sm:p-5">
        <header className="flex justify-between items-center border-b border-border pb-3 mb-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/60 animate-pulse" />
            <div className="space-y-1">
              <div className="h-5 w-40 bg-accent/70 rounded animate-pulse" />
              <div className="h-3 w-48 bg-accent/40 rounded animate-pulse" />
            </div>
          </div>
        </header>

        <main className="flex flex-1 min-h-0 h-full overflow-hidden rounded-xl border border-border bg-background">
          <aside className="w-48 sm:w-56 bg-card/60 border-r border-border p-3 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-accent/30 rounded-lg animate-pulse" />
            ))}
          </aside>
          <section className="flex-1 flex flex-col items-center justify-center">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" strokeWidth={2} />
            <p className="text-xs font-mono text-muted-foreground animate-pulse mt-2.5">
              Syncing team chat...
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
