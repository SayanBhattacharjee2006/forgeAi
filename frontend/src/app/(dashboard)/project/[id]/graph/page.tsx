"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Loader2,
  Network,
  GitBranch,
  Layers,
  Move,
  Search,
  ArrowRightLeft,
  ZoomIn,
  ArrowLeft,
  MessageSquare,
  ScrollText,
  FileText,
  Activity,
  Mic,
  Folder,
  Bot,
  Sparkles,
  Database,
  Cpu,
  Server,
  X,
  ExternalLink,
  ChevronRight,
  Info,
  SlidersHorizontal,
  Check,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { getSourceConfig } from "@/lib/sourceTypes";
import { applyDagreLayout } from "@/lib/graphLayout";

interface GraphNodeData {
  id: string;
  type: string;
  label: string;
  confidence_score?: number;
}

interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  relation: string;
}

interface GraphResponse {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

interface ArchNodeData {
  id: string;
  label: string;
  layer: "frontend" | "backend_api" | "backend_service" | "backend_core" | "external";
  subsystem?: string;
  tier?: number;
  detail?: string;
  role?: string;
  icon?: string;
  technologies?: string[];
}

interface ArchEdgeData {
  id: string;
  source: string;
  target: string;
  relation: string;
}

interface SubsystemInfo {
  id: string;
  label: string;
  icon: string;
}

interface ArchResponse {
  nodes: ArchNodeData[];
  edges: ArchEdgeData[];
  subsystems?: SubsystemInfo[];
  warnings?: string[];
}

const TIER_META: Record<
  number,
  { name: string; tag: string; color: string; border: string; bg: string; dot: string }
> = {
  1: {
    name: "Frontend Clients & UI",
    tag: "TIER 1 · UI",
    color: "text-indigo-400",
    border: "border-indigo-500/30 hover:border-indigo-500/70",
    bg: "bg-indigo-500/10",
    dot: "#818cf8",
  },
  2: {
    name: "API Gateway & Routes",
    tag: "TIER 2 · API",
    color: "text-emerald-400",
    border: "border-emerald-500/30 hover:border-emerald-500/70",
    bg: "bg-emerald-500/10",
    dot: "#34d399",
  },
  3: {
    name: "Core AI & Services",
    tag: "TIER 3 · SERVICE",
    color: "text-amber-400",
    border: "border-amber-500/30 hover:border-amber-500/70",
    bg: "bg-amber-500/10",
    dot: "#fbbf24",
  },
  4: {
    name: "Data & AI Infrastructure",
    tag: "TIER 4 · INFRA",
    color: "text-cyan-400",
    border: "border-cyan-500/30 hover:border-cyan-500/70",
    bg: "bg-cyan-500/10",
    dot: "#38bdf8",
  },
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties; strokeWidth?: number }>> = {
  MessageSquare,
  ScrollText,
  FileText,
  Activity,
  Network,
  Mic,
  Folder,
  Bot,
  Sparkles,
  Database,
  Cpu,
  Layers,
  GitBranch,
  Server,
};

type ViewMode = "architecture" | "decisions";
type LayoutDirection = "LR" | "TB";

// ── Decision graph builder ──
function buildDecisionFlow(
  data: GraphResponse,
  direction: LayoutDirection,
  selectedId: string | null
): { nodes: Node[]; edges: Edge[] } {
  const seenNodeIds = new Set<string>();
  const rfNodes: Node[] = [];
  for (const n of data.nodes) {
    if (!seenNodeIds.has(n.id)) {
      seenNodeIds.add(n.id);
      const config = getSourceConfig(n.type);
      const Icon = config.icon;
      const isSelected = selectedId === n.id;
      rfNodes.push({
        id: n.id,
        position: { x: 0, y: 0 },
        data: {
          raw: n,
          label: (
            <div className="flex items-center gap-2.5 text-left select-none">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `${config.color}20` }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: config.color }} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-mono tracking-wider" style={{ color: config.color }}>
                  {config.label}
                </div>
                <div className="text-xs font-semibold leading-tight text-foreground truncate">{n.label}</div>
              </div>
            </div>
          ),
        },
        style: {
          background: isSelected ? "#171717" : "#0d0d0d",
          border: isSelected ? `2px solid ${config.color}` : `1px solid ${config.color}40`,
          borderRadius: 10,
          padding: "10px 12px",
          width: 270,
          color: "#fafafa",
          boxShadow: isSelected ? `0 0 16px ${config.color}35` : "0 2px 8px rgba(0,0,0,0.4)",
        },
      });
    }
  }

  const seenEdgeIds = new Set<string>();
  const rfEdges: Edge[] = [];
  for (const e of data.edges) {
    if (!seenEdgeIds.has(e.id) && seenNodeIds.has(e.source) && seenNodeIds.has(e.target)) {
      seenEdgeIds.add(e.id);
      const isConnected = selectedId === e.source || selectedId === e.target;
      rfEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.relation,
        type: "smoothstep",
        animated: isConnected || e.relation === "derived_from",
        style: {
          stroke: isConnected ? "#10b981" : "#333333",
          strokeWidth: isConnected ? 2 : 1.2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConnected ? "#10b981" : "#444444",
          width: 14,
          height: 14,
        },
        labelBgStyle: { fill: "#0a0a0a" },
        labelStyle: { fill: isConnected ? "#34d399" : "#737373", fontSize: 10, fontWeight: 500 },
      });
    }
  }

  return {
    nodes: applyDagreLayout(rfNodes, rfEdges, direction, { nodeWidth: 270, nodeHeight: 65, ranksep: 100 }),
    edges: rfEdges,
  };
}

// ── Architecture graph builder ──
function buildArchitectureFlow(
  data: ArchResponse,
  direction: LayoutDirection,
  selectedSubsystem: string,
  searchQuery: string,
  selectedId: string | null
): { nodes: Node[]; edges: Edge[] } {
  const query = searchQuery.trim().toLowerCase();

  // Filter nodes based on active subsystem and search query
  const filteredRawNodes = data.nodes.filter((n) => {
    const matchesSubsystem =
      selectedSubsystem === "all" || n.subsystem === selectedSubsystem || n.layer === "external";
    const matchesSearch =
      !query ||
      n.label.toLowerCase().includes(query) ||
      n.detail?.toLowerCase().includes(query) ||
      n.role?.toLowerCase().includes(query) ||
      n.technologies?.some((t) => t.toLowerCase().includes(query));
    return matchesSubsystem && matchesSearch;
  });

  const activeNodeIds = new Set(filteredRawNodes.map((n) => n.id));

  const rfNodes: Node[] = [];
  for (const n of filteredRawNodes) {
    const tier = n.tier || (n.layer === "frontend" ? 1 : n.layer === "backend_api" ? 2 : n.layer === "backend_service" ? 3 : 4);
    const tierMeta = TIER_META[tier] || TIER_META[1];
    const IconComponent = ICON_MAP[n.icon || ""] || Server;
    const isSelected = selectedId === n.id;

    rfNodes.push({
      id: n.id,
      position: { x: 0, y: 0 },
      data: {
        raw: n,
        label: (
          <div className="p-3 text-left select-none space-y-2">
            {/* Header: Tier + Subsystem */}
            <div className="flex items-center justify-between gap-1.5 border-b border-[#222] pb-1.5">
              <span className={`text-[10px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded ${tierMeta.bg} ${tierMeta.color}`}>
                {tierMeta.tag}
              </span>
              {n.subsystem && (
                <span className="text-[10px] font-mono text-[#888] uppercase truncate max-w-[100px]">
                  {n.subsystem}
                </span>
              )}
            </div>

            {/* Component Title & Icon */}
            <div className="flex items-start gap-2.5">
              <div className={`w-8 h-8 rounded-lg ${tierMeta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                <IconComponent className={`w-4 h-4 ${tierMeta.color}`} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold leading-tight text-[#fafafa] tracking-tight truncate">
                  {n.label}
                </div>
                {n.detail && (
                  <div className="text-[11px] text-[#888] font-mono leading-tight truncate mt-0.5">
                    {n.detail}
                  </div>
                )}
              </div>
            </div>

            {/* Role & Technologies */}
            {n.role && (
              <p className="text-[11px] text-[#a3a3a3] leading-snug line-clamp-2">
                {n.role}
              </p>
            )}

            {n.technologies && n.technologies.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 border-t border-[#1a1a1a]">
                {n.technologies.slice(0, 3).map((t, idx) => (
                  <span key={idx} className="text-[9.5px] font-mono font-medium px-1.5 py-0.2 rounded bg-[#161616] text-[#b5b5b5] border border-[#262626]">
                    {t}
                  </span>
                ))}
                {n.technologies.length > 3 && (
                  <span className="text-[9.5px] font-mono px-1 text-[#666]">
                    +{n.technologies.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        ),
      },
      style: {
        background: isSelected ? "#141414" : "#0a0a0a",
        border: isSelected ? `2px solid ${tierMeta.dot}` : `1.5px solid #222222`,
        borderRadius: 12,
        padding: 0,
        width: 290,
        color: "#fafafa",
        boxShadow: isSelected
          ? `0 0 20px ${tierMeta.dot}40, 0 4px 16px rgba(0,0,0,0.8)`
          : "0 4px 14px rgba(0,0,0,0.5)",
        cursor: "pointer",
      },
    });
  }

  const seenEdgeIds = new Set<string>();
  const rfEdges: Edge[] = [];

  for (const e of data.edges) {
    if (!seenEdgeIds.has(e.id) && activeNodeIds.has(e.source) && activeNodeIds.has(e.target)) {
      seenEdgeIds.add(e.id);
      const isConnected = selectedId === e.source || selectedId === e.target;
      rfEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        label: e.relation,
        animated: isConnected,
        style: {
          stroke: isConnected ? "#10b981" : "#383838",
          strokeWidth: isConnected ? 2.2 : 1.4,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConnected ? "#10b981" : "#555555",
          width: 14,
          height: 14,
        },
        labelBgStyle: { fill: "#0a0a0a", fillOpacity: 0.95 },
        labelStyle: {
          fill: isConnected ? "#34d399" : "#888888",
          fontSize: 10,
          fontWeight: 600,
        },
      });
    }
  }

  return {
    nodes: applyDagreLayout(rfNodes, rfEdges, direction, {
      nodeWidth: 290,
      nodeHeight: 140,
      ranksep: direction === "LR" ? 140 : 90,
      nodesep: 50,
    }),
    edges: rfEdges,
  };
}

function GraphCanvas({
  nodes,
  edges,
  viewKey,
  wheelMode,
  onNodeClick,
}: {
  nodes: Node[];
  edges: Edge[];
  viewKey: string;
  wheelMode: "zoom" | "pan";
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ duration: 400, padding: 0.12 });
    }, 50);
    return () => clearTimeout(timer);
  }, [viewKey, fitView, nodes.length]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        key={viewKey}
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.05}
        maxZoom={2.2}
        panOnDrag={true}
        panOnScroll={wheelMode === "pan"}
        zoomOnScroll={wheelMode === "zoom"}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
        nodesDraggable={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a1a1a" gap={24} size={1.2} />
        <Controls
          showInteractive={true}
          position="bottom-left"
          className="!bg-[#0a0a0a] !border-[#262626] [&>button]:!bg-[#0a0a0a] [&>button]:!border-[#262626] [&>button]:!text-[#fafafa] [&>button:hover]:!bg-[#171717]"
        />
        <MiniMap
          position="bottom-right"
          style={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8 }}
          maskColor="rgba(0,0,0,0.7)"
          nodeColor={(n) => {
            const tier = n.data?.raw?.tier || 1;
            return TIER_META[tier]?.dot || "#262626";
          }}
        />
      </ReactFlow>
    </div>
  );
}

export default function GraphPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [view, setView] = useState<ViewMode>("architecture");
  const [direction, setDirection] = useState<LayoutDirection>("LR");
  const [wheelMode, setWheelMode] = useState<"zoom" | "pan">("zoom");
  const [subsystemFilter, setSubsystemFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedNode, setSelectedNode] = useState<ArchNodeData | GraphNodeData | null>(null);

  const [data, setData] = useState<GraphResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [archData, setArchData] = useState<ArchResponse | null>(null);
  const [archLoading, setArchLoading] = useState(false);
  const [archError, setArchError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    api
      .get<GraphResponse>(`/projects/${projectId}/graph`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load graph"))
      .finally(() => setIsLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setArchLoading(true);
    setArchError("");
    api
      .get<ArchResponse>(`/projects/${projectId}/architecture`)
      .then((res) => {
        setArchData(res);
      })
      .catch((err) => setArchError(err.message || "Failed to load project architecture"))
      .finally(() => setArchLoading(false));
  }, [projectId]);


  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.data?.raw) {
      setSelectedNode(node.data.raw);
    }
  }, []);

  const decisionFlow = useMemo(
    () => (data ? buildDecisionFlow(data, direction, selectedNode?.id || null) : null),
    [data, direction, selectedNode?.id]
  );

  const architectureFlow = useMemo(
    () =>
      archData
        ? buildArchitectureFlow(archData, direction, subsystemFilter, searchQuery, selectedNode?.id || null)
        : null,
    [archData, direction, subsystemFilter, searchQuery, selectedNode?.id]
  );

  const activeFlow = view === "architecture" ? architectureFlow : decisionFlow;
  const flowKey = `${view}-${direction}-${subsystemFilter}-${searchQuery}-${activeFlow?.nodes.length || 0}-${selectedNode?.id || ""}`;

  // Find upstream callers and downstream dependencies for selected node
  const connectedEdges = useMemo(() => {
    if (!selectedNode || !archData) return { incoming: [], outgoing: [] };
    const incoming = archData.edges
      .filter((e) => e.target === selectedNode.id)
      .map((e) => ({
        edge: e,
        node: archData.nodes.find((n) => n.id === e.source),
      }))
      .filter((item) => item.node);
    const outgoing = archData.edges
      .filter((e) => e.source === selectedNode.id)
      .map((e) => ({
        edge: e,
        node: archData.nodes.find((n) => n.id === e.target),
      }))
      .filter((item) => item.node);
    return { incoming, outgoing };
  }, [selectedNode, archData]);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen w-full bg-[#050505] text-foreground overflow-hidden select-none transition-colors duration-200">
      {/* ── Top Header Navigation & View Switcher ── */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-[#1f1f1f] bg-[#0c0c0c] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${projectId}`}
            className="p-2 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#262626] text-[#888] hover:text-[#fafafa] transition-colors cursor-pointer shrink-0 shadow-xs"
            title="Back to Project"
            aria-label="Back to Project"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-[#fafafa] flex items-center gap-2">
                <Network className="w-5 h-5 text-emerald-400" strokeWidth={2} />
                {view === "architecture" ? "Forge AI Architecture Flow" : "Knowledge & Decision Graph"}
              </h1>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {view === "architecture" ? "Live Component Topology" : "Decision Lineage"}
              </span>
            </div>
            <p className="text-xs text-[#888] mt-0.5">
              {view === "architecture"
                ? "Understandable 4-tier pipeline: Frontend Clients → API Gateways → Core Services → Data & AI Engines."
                : "Decisions connected to source files, messages, and team members."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Wheel mode: Zoom vs Pan */}
          <div className="flex items-center rounded-lg border border-[#262626] overflow-hidden bg-[#111]">
            <button
              onClick={() => setWheelMode("zoom")}
              title="Mouse wheel zooms canvas"
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                wheelMode === "zoom"
                  ? "bg-[#222] text-emerald-400 font-semibold"
                  : "text-[#888] hover:text-[#fafafa]"
              }`}
            >
              <ZoomIn className="w-3.5 h-3.5" />
              Zoom
            </button>
            <button
              onClick={() => setWheelMode("pan")}
              title="Mouse wheel scrolls canvas"
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                wheelMode === "pan"
                  ? "bg-[#222] text-emerald-400 font-semibold"
                  : "text-[#888] hover:text-[#fafafa]"
              }`}
            >
              <Move className="w-3.5 h-3.5" />
              Scroll
            </button>
          </div>

          {/* Direction toggle */}
          <button
            onClick={() => setDirection((prev) => (prev === "LR" ? "TB" : "LR"))}
            title="Toggle flow layout (Left-Right vs Top-Bottom)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#262626] bg-[#111] text-[#a3a3a3] hover:text-[#fafafa] hover:bg-[#1a1a1a] transition-colors cursor-pointer shadow-xs"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            {direction === "LR" ? "Horizontal" : "Vertical"}
          </button>

          {/* View Mode Switcher */}
          <div className="flex items-center rounded-lg border border-[#262626] bg-[#111] p-0.5">
            <button
              onClick={() => {
                setView("architecture");
                setSelectedNode(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                view === "architecture"
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "text-[#888] hover:text-[#fafafa]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" strokeWidth={2} />
              Architecture
            </button>
            <button
              onClick={() => {
                setView("decisions");
                setSelectedNode(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                view === "decisions"
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "text-[#888] hover:text-[#fafafa]"
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" strokeWidth={2} />
              Decisions Graph
            </button>
          </div>
        </div>
      </div>

      {/* ── Subsystem Filters & Component Search Bar ── */}
      {view === "architecture" && (
        <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-[#1c1c1c] bg-[#090909] flex items-center justify-between gap-3 flex-wrap">
          {/* Subsystem Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-[#737373] mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Subsystem:
            </span>
            {(archData?.subsystems || [
              { id: "all", label: "All Subsystems" },
              { id: "chat", label: "Chat & Assistant" },
              { id: "constitution", label: "Constitution & Rules" },
              { id: "decisions", label: "Decisions & Conflicts" },
              { id: "intelligence", label: "Intelligence & RAG" },
              { id: "voice", label: "Voice & Audio" },
              { id: "ingestion", label: "Ingestion Pipeline" },
            ]).map((sub) => {
              const active = subsystemFilter === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => setSubsystemFilter(sub.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                    active
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-2xs"
                      : "bg-[#121212] border-[#242424] text-[#888] hover:text-[#fafafa] hover:border-[#383838]"
                  }`}
                >
                  {sub.label}
                </button>
              );
            })}
          </div>

          {/* Live Search Box */}
          <div className="relative min-w-[200px] sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search components or tech..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-[#141414] border border-[#282828] text-xs text-[#fafafa] placeholder:text-[#555] focus:outline-none focus:border-emerald-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#fafafa]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tier Architecture Legend Bar ── */}
      {view === "architecture" && (
        <div className="shrink-0 px-4 sm:px-6 py-2 border-b border-[#181818] bg-[#070707] flex items-center justify-between text-xs text-[#888] flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap font-medium">
            <span className="text-[#666] font-mono uppercase text-[10px]">Tiers:</span>
            {Object.entries(TIER_META).map(([tierKey, meta]) => (
              <div key={tierKey} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.dot }} />
                <span className="text-[#d4d4d4]">{meta.name}</span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[#666] font-mono">
            💡 Click any component to inspect data flows & dependencies
          </div>
        </div>
      )}

      {/* ── Main Graph Canvas & Side Inspector ── */}
      <div className="flex-1 w-full h-full relative min-h-0 flex overflow-hidden">
        {view === "decisions" && isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" strokeWidth={2} />
            <p className="text-xs font-mono text-[#888]">Loading decision graph...</p>
          </div>
        ) : view === "decisions" && error ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : view === "decisions" && (!data || data.nodes.length === 0) ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <Network className="w-10 h-10 text-[#333] mb-3" strokeWidth={1.5} />
            <h2 className="text-base font-bold text-[#fafafa] mb-1">No decision data yet</h2>
            <p className="text-[#888] text-xs max-w-sm">
              Extract decisions first from the Decision Intelligence Log page.
            </p>
          </div>
        ) : view === "architecture" && archLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" strokeWidth={2} />
            <p className="text-xs text-[#888] font-mono">
              Loading system architecture flow...
            </p>
          </div>
        ) : view === "architecture" && archError ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-red-400 text-sm">{archError}</p>
          </div>
        ) : (
          <div className="flex-1 w-full h-full relative min-h-0">
            <ReactFlowProvider>
              <GraphCanvas
                nodes={activeFlow?.nodes || []}
                edges={activeFlow?.edges || []}
                viewKey={flowKey}
                wheelMode={wheelMode}
                onNodeClick={handleNodeClick}
              />
            </ReactFlowProvider>
          </div>
        )}

        {/* ── Interactive Component Inspector Drawer ── */}
        {selectedNode && (
          <div className="w-80 sm:w-96 border-l border-[#222] bg-[#0c0c0c] flex flex-col shrink-0 z-20 shadow-2xl animate-fade-in">
            {/* Header */}
            <div className="p-4 border-b border-[#222] flex items-center justify-between bg-[#111]">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-[#fafafa]">Component Inspector</h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded text-[#737373] hover:text-[#fafafa] hover:bg-[#202020] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Basic Info */}
              <div className="space-y-2">
                {"tier" in selectedNode && selectedNode.tier && (
                  <span
                    className={`inline-block text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded ${
                      TIER_META[selectedNode.tier]?.bg || ""
                    } ${TIER_META[selectedNode.tier]?.color || ""}`}
                  >
                    {TIER_META[selectedNode.tier]?.name || `TIER ${selectedNode.tier}`}
                  </span>
                )}
                <h2 className="text-base font-extrabold text-[#fafafa]">{selectedNode.label}</h2>
                {"detail" in selectedNode && selectedNode.detail && (
                  <p className="text-[11px] font-mono text-[#a3a3a3] bg-[#141414] px-2 py-1 rounded border border-[#222]">
                    {selectedNode.detail}
                  </p>
                )}
              </div>

              {/* Role & Responsibilities */}
              {"role" in selectedNode && selectedNode.role && (
                <div className="space-y-1.5 p-3 rounded-lg bg-[#141414] border border-[#222]">
                  <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block">
                    Architectural Role:
                  </span>
                  <p className="text-xs text-[#d4d4d4] leading-relaxed">{selectedNode.role}</p>
                </div>
              )}

              {/* Technologies */}
              {"technologies" in selectedNode && selectedNode.technologies && selectedNode.technologies.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block">
                    Technologies & Protocols:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.technologies.map((t, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-[#171717] border border-[#2c2c2c] text-[#fafafa] font-mono text-xs font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Inbound Callers (Upstream) */}
              {connectedEdges.incoming.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#222]">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Called By ({connectedEdges.incoming.length} Upstream):
                  </span>
                  <div className="space-y-1.5">
                    {connectedEdges.incoming.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedNode(item.node || null)}
                        className="w-full text-left p-2 rounded-lg bg-[#141414] hover:bg-[#1c1c1c] border border-[#242424] text-xs transition-colors cursor-pointer flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[#fafafa] truncate">{item.node?.label}</div>
                          <div className="text-[10px] text-[#737373] font-mono truncate">{item.edge.relation}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-[#555] shrink-0 ml-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Outbound Dependencies (Downstream) */}
              {connectedEdges.outgoing.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#222]">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                    Calls / Depends On ({connectedEdges.outgoing.length} Downstream):
                  </span>
                  <div className="space-y-1.5">
                    {connectedEdges.outgoing.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedNode(item.node || null)}
                        className="w-full text-left p-2 rounded-lg bg-[#141414] hover:bg-[#1c1c1c] border border-[#242424] text-xs transition-colors cursor-pointer flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[#fafafa] truncate">{item.node?.label}</div>
                          <div className="text-[10px] text-[#737373] font-mono truncate">{item.edge.relation}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-[#555] shrink-0 ml-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Jump if Frontend page */}
              {"detail" in selectedNode && selectedNode.detail && selectedNode.detail.startsWith("/") && (
                <div className="pt-2">
                  <Link
                    href={selectedNode.detail.replace("[id]", projectId)}
                    className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs transition-colors shadow-xs"
                  >
                    Open {selectedNode.label}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

