import React from "react";
import { Loader2 } from "lucide-react";

export default function GraphLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen w-full bg-background text-foreground animate-fade-in">
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-border bg-card/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-accent/60 rounded-md animate-pulse" />
          <div className="space-y-1">
            <div className="h-4 w-36 bg-accent/70 rounded animate-pulse" />
            <div className="h-3 w-64 bg-accent/40 rounded animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" strokeWidth={2} />
        <p className="text-xs font-mono text-muted-foreground animate-pulse mt-3">
          Constructing interactive knowledge graph...
        </p>
      </div>
    </div>
  );
}
