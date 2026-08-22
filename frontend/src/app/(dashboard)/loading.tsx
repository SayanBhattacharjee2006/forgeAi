import React from "react";
import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8 max-w-[1400px] w-full mx-auto animate-fade-in">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-accent/60 rounded-md animate-pulse" />
          <div className="h-4 w-72 bg-accent/40 rounded-md animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-28 bg-accent/50 rounded-md animate-pulse" />
          <div className="h-9 w-32 bg-accent/70 rounded-md animate-pulse" />
        </div>
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-accent/50 rounded animate-pulse" />
              <div className="h-4 w-12 bg-accent/30 rounded animate-pulse" />
            </div>
            <div className="h-8 w-16 bg-accent/70 rounded animate-pulse" />
            <div className="h-3 w-32 bg-accent/30 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Main Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="h-5 w-36 bg-accent/60 rounded animate-pulse" />
            <div className="h-4 w-20 bg-accent/40 rounded animate-pulse" />
          </div>
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-accent/30 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-2xs flex flex-col justify-center items-center py-16">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" strokeWidth={2} />
          <p className="text-xs font-mono text-muted-foreground animate-pulse mt-2">Loading workspace...</p>
        </div>
      </div>
    </div>
  );
}
