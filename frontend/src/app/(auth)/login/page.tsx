"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { GithubIcon } from "@/components/shared/github-icon";
import { useAuthStore } from "@/store/use-auth-store";
import Link from "next/link";

interface MatrixDot {
  x: number;
  y: number;
  minAlpha: number;
  maxAlpha: number;
  freq: number;       // Blinks per second (Hz)
  phase: number;      // Random offset [0, 1]
  pulseWidth: number; // Duration fraction of the active flash [0.15, 0.45]
  size: number;
}

// High-performance canvas matrix background with visibly blinking & twinkling dots
function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initGrid();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    const gridSize = 12;
    let dots: MatrixDot[] = [];

    const initGrid = () => {
      dots = [];
      const cols = Math.ceil(width / gridSize);
      const rows = Math.ceil(height / gridSize);

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const rand = Math.random();
          // Active dot density distribution matching the reference screenshot
          if (rand > 0.42) {
            const isHighlight = rand > 0.93;
            const isMedium = rand > 0.75;

            // Maximum opacity during peak blink
            const maxAlpha = isHighlight
              ? 0.85 + Math.random() * 0.15
              : isMedium
              ? 0.45 + Math.random() * 0.35
              : 0.15 + Math.random() * 0.25;

            // Minimum opacity when dimmed
            const minAlpha = isHighlight
              ? 0.04 + Math.random() * 0.06
              : 0.0;

            // Balanced, smooth frequency of blinks: 0.5Hz to 1.6Hz (blinks every ~0.8s to 2.0s)
            const freq = 0.5 + Math.random() * 1.1;
            const phase = Math.random();
            const pulseWidth = isHighlight ? 0.4 + Math.random() * 0.2 : 0.3 + Math.random() * 0.25;
            const size = isHighlight ? 2.2 : 1.8;

            dots.push({
              x: i * gridSize,
              y: j * gridSize,
              minAlpha,
              maxAlpha,
              freq,
              phase,
              pulseWidth,
              size,
            });
          }
        }
      }
    };

    initGrid();

    const render = (currentTime: number) => {
      const t = currentTime * 0.001; // Current time in seconds

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      // Top ambient spotlight glow
      const radialGlow = ctx.createRadialGradient(
        width / 2,
        height * 0.26,
        40,
        width / 2,
        height * 0.34,
        width * 0.55
      );
      radialGlow.addColorStop(0, "rgba(255, 255, 255, 0.045)");
      radialGlow.addColorStop(0.5, "rgba(255, 255, 255, 0.012)");
      radialGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, width, height);

      // Render blinking dots
      const numDots = dots.length;
      for (let i = 0; i < numDots; i++) {
        const dot = dots[i];

        // Fractional cycle [0, 1) based on dot's frequency and random phase
        const cycle = ((t * dot.freq + dot.phase) % 1 + 1) % 1;

        let brightness = 0;
        if (cycle < dot.pulseWidth) {
          // Half-sine pulse for smooth flash on and fade off
          brightness = Math.sin((cycle / dot.pulseWidth) * Math.PI);
        }

        let alpha = dot.minAlpha + (dot.maxAlpha - dot.minAlpha) * brightness;

        // Interactive mouse hover glow
        const dx = dot.x - mouseX;
        const dy = dot.y - mouseY;
        const distSq = dx * dx + dy * dy;
        if (distSq < 22500) { // 150px radius
          const dist = Math.sqrt(distSq);
          const factor = (1 - dist / 150) * 0.5;
          alpha = Math.min(1.0, alpha + factor);
        }

        if (alpha > 0.01) {
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          ctx.fillRect(dot.x, dot.y, dot.size, dot.size);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 w-full h-full"
    />
  );
}

export default function LoginPage() {
  const { login, isAuthenticated, token } = useAuthStore();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && token) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, token, router]);

  const handleGithubLogin = () => {
    setIsRedirecting(true);
    setInfoMessage(null);
    login();
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setInfoMessage("Authenticating with GitHub OAuth...");
    setIsRedirecting(true);
    setTimeout(() => {
      login();
    }, 500);
  };

  return (
    <div className="relative min-h-screen w-full bg-black text-white flex flex-col items-center justify-center overflow-hidden font-sans select-none px-4">
      {/* Dynamic Digital Matrix Blinking & Twinkling Background */}
      <MatrixBackground />

      {/* Top ambient spotlight glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] pointer-events-none z-0"
        style={{
          background: "radial-gradient(ellipse 600px 300px at 50% 10%, rgba(255, 255, 255, 0.07), transparent 75%)",
        }}
      />

      {/* Back to Home navigation */}
      <div className="absolute top-6 left-6 z-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors bg-zinc-950/70 hover:bg-zinc-900 border border-zinc-800/80 px-3 py-1.5 rounded-full backdrop-blur-md"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Forge</span>
        </Link>
      </div>

      {/* Main Center Content Container */}
      <div className="relative z-10 w-full max-w-xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-500">
        {/* Title Header */}
        <h1 className="text-4xl sm:text-5xl md:text-[56px] font-bold tracking-tight text-white leading-none whitespace-nowrap">
          Welcome Developer
        </h1>

        {/* Subtitle */}
        <p className="text-zinc-400 text-lg sm:text-xl md:text-[22px] font-light mt-3 mb-9 tracking-normal">
          Your sign in component
        </p>

        {/* GitHub Sign In Button */}
        <button
          onClick={handleGithubLogin}
          disabled={isRedirecting}
          className="group relative w-full max-w-[460px] h-[54px] rounded-full bg-zinc-950/80 hover:bg-zinc-900/90 border border-zinc-800/90 hover:border-zinc-600 transition-all duration-200 flex items-center justify-center gap-3 px-6 shadow-[0_4px_24px_rgba(0,0,0,0.7)] hover:shadow-[0_0_25px_rgba(255,255,255,0.06)] active:scale-[0.985] cursor-pointer backdrop-blur-md disabled:opacity-75"
        >
          {isRedirecting ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <GithubIcon size={19} className="text-white group-hover:scale-105 transition-transform" />
          )}
          <span className="text-[15px] font-medium text-white tracking-wide">
            {isRedirecting ? "Connecting to GitHub..." : "Sign in with GitHub"}
          </span>
        </button>

        {/* Divider with "or" */}
        <div className="flex items-center gap-4 w-full max-w-[460px] my-5">
          <div className="flex-1 h-px bg-zinc-800/80" />
          <span className="text-xs text-zinc-500 font-normal tracking-wider lowercase">or</span>
          <div className="flex-1 h-px bg-zinc-800/80" />
        </div>

        {/* Email / Input Pill with Submit Arrow */}
        <form
          onSubmit={handleEmailSubmit}
          className="relative w-full max-w-[460px] h-[54px] rounded-full bg-zinc-950/80 border border-zinc-800/90 focus-within:border-zinc-600 transition-all duration-200 flex items-center px-4 shadow-[0_4px_24px_rgba(0,0,0,0.7)] backdrop-blur-md"
        >
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="info@gmail.com"
            disabled={isRedirecting}
            className="flex-1 bg-transparent border-none outline-none text-[15px] text-zinc-200 placeholder:text-zinc-500 text-center pl-8 pr-2 font-normal focus:placeholder:opacity-0 transition-opacity"
          />

          <button
            type="submit"
            disabled={isRedirecting}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all duration-150 shrink-0 cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-40"
            title="Continue"
            aria-label="Continue"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Feedback Message */}
        {infoMessage && (
          <p className="text-xs text-emerald-400 font-mono mt-4 animate-in fade-in">
            {infoMessage}
          </p>
        )}

        {/* Terms Note */}
        <p className="text-[11px] text-zinc-600 text-center mt-8 max-w-xs leading-relaxed">
          By signing in, you agree to Forge AI&apos;s developer terms and persistent memory privacy policy.
        </p>
      </div>
    </div>
  );
}
