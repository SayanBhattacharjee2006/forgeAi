import React from "react";
import { Loader2 } from "lucide-react";

export default function ChatLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-h-[calc(100vh-56px)] overflow-hidden bg-background text-foreground animate-fade-in">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-border bg-card/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-accent/60 animate-pulse" />
          <div className="space-y-1">
            <div className="h-4 w-36 bg-accent/70 rounded animate-pulse" />
            <div className="h-3 w-48 bg-accent/40 rounded animate-pulse" />
          </div>
        </div>
        <div className="h-6 w-24 bg-accent/40 rounded-full animate-pulse" />
      </div>

      {/* Messages Feed Skeleton */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" strokeWidth={2} />
            <p className="text-xs font-mono text-muted-foreground animate-pulse mt-2.5">
              Connecting to project AI grounding...
            </p>
          </div>
        </div>
      </div>

      {/* Input Skeleton */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-border bg-background">
        <div className="max-w-3xl mx-auto">
          <div className="h-11 bg-card border border-border rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
