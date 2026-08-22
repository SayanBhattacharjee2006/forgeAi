import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="bg-card border border-border rounded-xl p-8 max-w-sm w-full text-center shadow-lg">
        <div className="w-10 h-10 rounded-md bg-background border border-border flex items-center justify-center mx-auto mb-4">
          <Zap className="w-5 h-5 text-emerald-500" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-1.5 tracking-tight">404</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mb-5">
          This page doesn&apos;t exist in your workspace or knowledge graph.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs sm:text-sm font-semibold rounded-md hover:opacity-90 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 bg-secondary text-secondary-foreground border border-border text-xs sm:text-sm font-medium rounded-md hover:bg-accent transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
