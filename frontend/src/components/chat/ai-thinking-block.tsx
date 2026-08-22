"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { Card } from "@/components/ui/card";

interface AIThinkingBlockProps {
  customText?: string;
  query?: string;
}

const DEFAULT_THINKING_CONTENT = `Initializing ForgeAI reasoning pipeline...
Parsing user query and extracting semantic intent...
Connecting to project vector database (Qdrant)...
Scanning indexed GitHub repository branches, commits, and pull requests...
Analyzing commit messages and code diffs for architectural context...
Searching indexed Discord channels and team meeting transcripts...
Retrieving recorded architectural decisions from persistent memory...
Calculating cosine similarity scores across knowledge chunks...
Filtering high-relevance source documents (threshold > 0.70)...
Synthesizing multi-source context from code, chat, and documentation...
Cross-validating answer against latest commit history to prevent hallucination...
Formatting response with precise citations and verified code references...
Generating finalized answer...`;

export function AIThinkingBlock({ customText, query }: AIThinkingBlockProps) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const [timer, setTimer] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const thinkingContent =
    customText ||
    (query
      ? `Analyzing project query: "${query}"\n\n${DEFAULT_THINKING_CONTENT}`
      : DEFAULT_THINKING_CONTENT);

  // 1-second elapsed timer
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(timerInterval);
    };
  }, []);

  // Smooth continuous auto-scroll
  useEffect(() => {
    if (contentRef.current) {
      const scrollHeight = contentRef.current.scrollHeight;
      const clientHeight = contentRef.current.clientHeight;
      const maxScroll = scrollHeight - clientHeight;

      if (maxScroll <= 0) return;

      scrollIntervalRef.current = setInterval(() => {
        setScrollPosition((prev) => {
          const newPosition = prev + 1;
          if (newPosition >= maxScroll) {
            return 0;
          }
          return newPosition;
        });
      }, 35);

      return () => {
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current);
        }
      };
    }
  }, [thinkingContent]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  return (
    <div className="flex flex-col p-1 max-w-xl w-full animate-fade-in">
      <div className="flex items-center justify-start gap-2 mb-2.5">
        <Loader size="sm" />
        <p
          className="bg-[linear-gradient(110deg,#71717a,35%,#09090b,50%,#71717a,75%,#71717a)] dark:bg-[linear-gradient(110deg,#71717a,35%,#ffffff,50%,#71717a,75%,#71717a)] bg-[length:200%_100%] bg-clip-text text-sm font-semibold text-transparent animate-[shimmer_3s_linear_infinite]"
          style={{
            animation: "shimmer 3s linear infinite",
          }}
        >
          ForgeAI is thinking
        </p>
        <span className="text-xs text-muted-foreground font-mono">
          {timer}s
        </span>
      </div>

      <Card className="relative h-[135px] overflow-hidden bg-card border border-border p-0 rounded-xl shadow-2xs">
        {/* Top fade overlay */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-card via-card/75 to-transparent z-10 pointer-events-none h-[45px]" />

        {/* Bottom fade overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-card via-card/75 to-transparent z-10 pointer-events-none h-[45px]" />

        {/* Scrolling content */}
        <div
          ref={contentRef}
          className="h-full overflow-hidden p-3.5 text-muted-foreground select-none"
          style={{
            scrollBehavior: "auto",
          }}
        >
          <p className="text-xs font-mono leading-relaxed whitespace-pre-wrap text-foreground/80">
            {thinkingContent}
          </p>
        </div>
      </Card>
    </div>
  );
}

export default AIThinkingBlock;
