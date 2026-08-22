import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoaderProps extends React.ComponentProps<"div"> {
  size?: "sm" | "default" | "lg";
}

export function Loader({ size = "default", className, ...props }: LoaderProps) {
  const sizeClass = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-6 h-6" : "w-5 h-5";

  return (
    <div className={cn("inline-flex items-center justify-center", className)} {...props}>
      <Loader2 className={cn("animate-spin text-emerald-500", sizeClass)} />
    </div>
  );
}
