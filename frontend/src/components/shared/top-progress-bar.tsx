"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const doneTimerRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = () => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  // When route change completes, immediately fill and dismiss the progress bar
  useEffect(() => {
    clearTimers();
    if (visible) {
      setProgress(100);
      doneTimerRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    }
    return () => clearTimers();
  }, [pathname, searchParams]);

  // Click interceptor to show instant progress on navigation
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (
        target &&
        target.href &&
        target.href.startsWith(window.location.origin) &&
        !target.href.includes("#") &&
        target.target !== "_blank"
      ) {
        try {
          const url = new URL(target.href);
          const currentUrl = new URL(window.location.href);
          if (
            url.pathname !== currentUrl.pathname ||
            url.search !== currentUrl.search
          ) {
            clearTimers();
            setVisible(true);
            setProgress(35);

            stepTimerRef.current = setTimeout(() => {
              setProgress(75);
              stepTimerRef.current = setTimeout(() => {
                setProgress(88);
              }, 250);
            }, 120);

            // Safety fail-safe: Auto-dismiss within 1.5s in case the route is instantaneous or cancelled
            safetyTimerRef.current = setTimeout(() => {
              setProgress(100);
              doneTimerRef.current = setTimeout(() => {
                setVisible(false);
                setProgress(0);
              }, 150);
            }, 1500);
          }
        } catch {}
      }
    };

    document.addEventListener("click", handleClick, { passive: true });
    return () => {
      document.removeEventListener("click", handleClick);
      clearTimers();
    };
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-9999 pointer-events-none h-[2px] bg-transparent overflow-hidden">
      <div
        className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)] transition-all duration-150 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
