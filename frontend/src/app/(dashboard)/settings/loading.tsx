import React from "react";
import { Loader2 } from "lucide-react";

export default function SettingsLoading() {
  return (
    <div className="flex-1 space-y-5 p-5 lg:p-6 max-w-[1400px] w-full mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 bg-accent/60 rounded-lg animate-pulse" />
          <div className="space-y-1">
            <div className="h-7 w-36 bg-accent/70 rounded animate-pulse" />
            <div className="h-4 w-64 bg-accent/40 rounded animate-pulse" />
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-3">
        <div className="h-10 w-72 bg-accent/50 rounded-lg animate-pulse" />
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
