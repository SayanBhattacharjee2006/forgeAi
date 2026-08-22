import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TopProgressBar } from "@/components/shared/top-progress-bar";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Forge — AI Project Memory",
  description:
    "AI project memory for engineering teams that ingests GitHub commits, PRs, and Discord threads, building a living vector knowledge graph with verified source citations.",
  keywords: ["AI", "project memory", "GitHub", "Discord", "RAG", "Vector Search", "Qdrant", "Knowledge Graph"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark antialiased`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('forge-theme');
                  if (stored === 'light') {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.classList.add('light');
                  } else {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen font-sans bg-background text-foreground" suppressHydrationWarning>
        <ThemeProvider>
          <Suspense fallback={null}>
            <TopProgressBar />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
