"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ScrollText,
  History,
  Edit3,
  Check,
  X,
  Loader2,
  Cpu,
  Layers,
  Code2,
  GitBranch,
  Globe,
  Palette,
  AlertOctagon,
  ArrowLeft,
} from "lucide-react";
import { useProjectStore } from "@/store/use-project-store";
import { useAuthStore } from "@/store/use-auth-store";
import { api } from "@/lib/api";
import {
  ProjectConstitution,
  ConstitutionSections,
  ConstitutionHistoryItem,
} from "@/types";

function formatDateTime(isoString: string): string {
  if (!isoString) return "Never";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "Recently";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Recently";
  }
}

// Tag input component for lists
function TagListEditor({
  label,
  tags,
  onChange,
  placeholder = "Add item and press Enter...",
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [inputVal, setInputVal] = useState("");

  const handleAdd = () => {
    const trimmed = inputVal.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInputVal("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs sm:text-sm font-medium text-[#a3a3a3]">{label}</label>
      <div className="flex flex-wrap gap-2 p-2.5 rounded-lg bg-[#0d0d0d] border border-[#222] min-h-[44px] items-center">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-xs font-mono text-[#fafafa]"
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="text-[#737373] hover:text-red-400 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleAdd}
          placeholder={tags.length === 0 ? placeholder : "+ Add another"}
          className="flex-1 min-w-[140px] bg-transparent text-xs sm:text-sm text-[#fafafa] outline-none placeholder:text-[#525252] px-1.5"
        />
      </div>
    </div>
  );
}

export default function ConstitutionPage() {
  const params = useParams();
  const projectId = params.id as string;

  const currentProject = useProjectStore((state) => state.currentProject);
  const fetchProject = useProjectStore((state) => state.fetchProject);
  const user = useAuthStore((state) => state.user);

  const [constitution, setConstitution] = useState<ProjectConstitution | null>(null);
  const [history, setHistory] = useState<ConstitutionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistorySnapshot, setSelectedHistorySnapshot] = useState<ConstitutionHistoryItem | null>(null);

  // Edit form state
  const [editSections, setEditSections] = useState<ConstitutionSections | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<"tech" | "arch" | "code" | "git" | "api" | "ui" | "rules">("tech");

  const isOwner =
    currentProject?.user_role === "owner" ||
    user?.user_id === currentProject?.owner_id ||
    (currentProject?.member_roles && user?.user_id && currentProject.member_roles[user.user_id] === "owner");

  const loadHistory = async () => {
    if (!projectId) return;
    try {
      const data = await api.get<ConstitutionHistoryItem[]>(`/projects/${projectId}/constitution/history`);
      setHistory(data || []);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId, true);
      api
        .get<ProjectConstitution>(`/projects/${projectId}/constitution`)
        .then(setConstitution)
        .catch((err) => console.error("Failed to load constitution:", err))
        .finally(() => setIsLoading(false));

      api
        .get<ConstitutionHistoryItem[]>(`/projects/${projectId}/constitution/history`)
        .then((data) => setHistory(data || []))
        .catch((err) => console.error("Failed to load history:", err));
    }
  }, [projectId, fetchProject]);

  const handleOpenEdit = () => {
    if (!constitution) return;
    setEditSections(JSON.parse(JSON.stringify(constitution.sections)));
    setChangeSummary("");
    setSaveError(null);
    setShowEditModal(true);
  };

  const handleSaveConstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSections) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const updated = await api.put<ProjectConstitution>(`/projects/${projectId}/constitution`, {
        sections: editSections,
        change_summary: changeSummary.trim() || undefined,
      });
      setConstitution(updated);
      setShowEditModal(false);
      await loadHistory();
    } catch (err: unknown) {
      console.error("Failed to save constitution:", err);
      setSaveError((err as Error).message || "Failed to save constitution.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-5 h-5 text-[#10b981] animate-spin" strokeWidth={2} />
      </div>
    );
  }

  const s = selectedHistorySnapshot ? selectedHistorySnapshot.sections : constitution?.sections;
  const currentVersion = selectedHistorySnapshot ? selectedHistorySnapshot.version : constitution?.version || 1;
  const isViewingHistory = !!selectedHistorySnapshot;

  return (
    <div className="flex-1 space-y-5 p-5 lg:p-8 max-w-[1400px] w-full mx-auto animate-fade-in bg-background text-foreground transition-colors duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href={`/project/${projectId}`}
            className="p-2 rounded-lg bg-card hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 mt-0.5 shadow-xs"
            title="Back to Project"
            aria-label="Back to Project"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                Project Constitution
              </h1>
              <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                v{currentVersion}
              </span>
              <span className="text-xs text-muted-foreground font-mono">Authoritative Technical Agreement</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              The authoritative technical stack, architecture rules, coding standards, and agreements for <strong className="text-foreground">{currentProject?.name}</strong>. Grounded as primary context for Forge AI.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground text-xs sm:text-sm font-medium transition-colors cursor-pointer shadow-xs"
          >
            <History className="w-3.5 h-3.5" />
            History ({history.length + 1})
          </button>
          {isOwner && (
            <button
              onClick={handleOpenEdit}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Constitution
            </button>
          )}
        </div>
      </div>

      {/* Snapshot Viewing Notice */}
      {isViewingHistory && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-300 text-xs sm:text-sm">
            <History className="w-4 h-4 shrink-0" />
            <span>
              Viewing historical snapshot <strong>v{selectedHistorySnapshot.version}</strong> (from{" "}
              {formatDateTime(selectedHistorySnapshot.updated_at)})
            </span>
          </div>
          <button
            onClick={() => setSelectedHistorySnapshot(null)}
            className="text-xs text-amber-200 underline font-semibold cursor-pointer"
          >
            Return to Active v{constitution?.version}
          </button>
        </div>
      )}

      {/* 7 Constitution Section Cards in Dense 3-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Technology Stack */}
        <div className="bg-card p-4 sm:p-5 space-y-3 rounded-xl border border-border shadow-xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-border pb-2.5 mb-3">
              <Cpu className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm sm:text-base font-bold text-foreground">1. Technology Stack</h2>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Languages:</span>
                {s?.technology.languages && s.technology.languages.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.technology.languages.map((l, i) => (
                      <span key={i} className="px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border font-mono text-xs sm:text-sm font-medium">
                        {l}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Frameworks:</span>
                {s?.technology.frameworks && s.technology.frameworks.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.technology.frameworks.map((f, i) => (
                      <span key={i} className="px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border font-mono text-xs sm:text-sm font-medium">
                        {f}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Databases:</span>
                {s?.technology.databases && s.technology.databases.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.technology.databases.map((d, i) => (
                      <span key={i} className="px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border font-mono text-xs sm:text-sm font-medium">
                        {d}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
            </div>
          </div>
          {s?.technology.notes && (
            <p className="text-muted-foreground text-xs sm:text-sm pt-2 border-t border-border leading-relaxed mt-2">
              <strong className="text-foreground font-bold">Notes:</strong> {s.technology.notes}
            </p>
          )}
        </div>

        {/* 2. Architecture */}
        <div className="bg-card p-4 sm:p-5 space-y-3 rounded-xl border border-border shadow-xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-border pb-2.5 mb-3">
              <Layers className="w-4 h-4 text-purple-500" />
              <h2 className="text-sm sm:text-base font-bold text-foreground">2. Architecture Rules</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-muted-foreground text-xs font-mono font-bold uppercase tracking-wider">Style:</span>
                <span className="px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground font-mono text-xs sm:text-sm font-medium border border-border">
                  {s?.architecture.style || "Unspecified"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Core Rules:</span>
                {s?.architecture.rules && s.architecture.rules.length > 0 ? (
                  <ul className="space-y-1.5">
                    {s.architecture.rules.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-foreground text-xs sm:text-sm font-medium leading-snug">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground italic text-xs">No rules defined yet</span>
                )}
              </div>
            </div>
          </div>
          {s?.architecture.notes && (
            <p className="text-muted-foreground text-xs sm:text-sm pt-2 border-t border-border leading-relaxed mt-2">
              <strong className="text-foreground font-bold">Notes:</strong> {s.architecture.notes}
            </p>
          )}
        </div>

        {/* 3. Coding Standards */}
        <div className="bg-card p-4 sm:p-5 space-y-3 rounded-xl border border-border shadow-xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-border pb-2.5 mb-3">
              <Code2 className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm sm:text-base font-bold text-foreground">3. Coding Standards</h2>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Naming & Conventions:</span>
                {s?.coding_standards.naming_conventions && s.coding_standards.naming_conventions.length > 0 ? (
                  <ul className="space-y-1.5">
                    {s.coding_standards.naming_conventions.map((n, i) => (
                      <li key={i} className="flex items-start gap-2 text-foreground text-xs sm:text-sm font-medium leading-snug">
                        <span className="text-blue-500 font-mono font-bold">•</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Error Handling:</span>
                {s?.coding_standards.error_handling && s.coding_standards.error_handling.length > 0 ? (
                  <ul className="space-y-1.5">
                    {s.coding_standards.error_handling.map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-foreground text-xs sm:text-sm font-medium leading-snug">
                        <span className="text-blue-500 font-mono font-bold">•</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Git Workflow */}
        <div className="bg-card p-4 sm:p-5 space-y-3 rounded-xl border border-border shadow-xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-border pb-2.5 mb-3">
              <GitBranch className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm sm:text-base font-bold text-foreground">4. Git Workflow</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-muted-foreground text-xs font-mono font-bold uppercase tracking-wider">Merge:</span>
                <span className="px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground font-mono text-xs sm:text-sm font-medium border border-border">
                  {s?.git_workflow.merge_strategy || "Unspecified"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Branch Naming:</span>
                {s?.git_workflow.branch_naming && s.git_workflow.branch_naming.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.git_workflow.branch_naming.map((b, i) => (
                      <span key={i} className="px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border font-mono text-xs sm:text-sm font-medium">
                        {b}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Commit Conventions:</span>
                {s?.git_workflow.commit_conventions && s.git_workflow.commit_conventions.length > 0 ? (
                  <ul className="space-y-1">
                    {s.git_workflow.commit_conventions.map((c, i) => (
                      <li key={i} className="text-foreground font-mono text-xs sm:text-sm font-medium leading-relaxed bg-secondary/60 px-2.5 py-1 rounded border border-border">
                        {c}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 5. API Conventions */}
        <div className="bg-card p-4 sm:p-5 space-y-3 rounded-xl border border-border shadow-xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-border pb-2.5 mb-3">
              <Globe className="w-4 h-4 text-teal-500" />
              <h2 className="text-sm sm:text-base font-bold text-foreground">5. API Conventions</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-muted-foreground text-xs font-mono font-bold uppercase tracking-wider">Style:</span>
                <span className="px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground font-mono text-xs sm:text-sm font-medium border border-border">
                  {s?.api_conventions.style || "REST"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Endpoint Naming:</span>
                {s?.api_conventions.endpoint_naming && s.api_conventions.endpoint_naming.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.api_conventions.endpoint_naming.map((ep, i) => (
                      <span key={i} className="px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border font-mono text-xs sm:text-sm font-medium">
                        {ep}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 6. Design & UI Conventions */}
        <div className="bg-card p-4 sm:p-5 space-y-3 rounded-xl border border-border shadow-xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-border pb-2.5 mb-3">
              <Palette className="w-4 h-4 text-pink-500" />
              <h2 className="text-sm sm:text-base font-bold text-foreground">6. Design / UI Conventions</h2>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-muted-foreground block text-xs font-mono font-bold uppercase tracking-wider mb-1.5">Component & Styling Rules:</span>
                {s?.design_ui_conventions.styling_conventions && s.design_ui_conventions.styling_conventions.length > 0 ? (
                  <ul className="space-y-1.5">
                    {s.design_ui_conventions.styling_conventions.map((sc, i) => (
                      <li key={i} className="text-foreground text-xs sm:text-sm font-medium leading-snug flex items-start gap-2">
                        <span className="text-pink-500 font-mono font-bold">•</span>
                        <span>{sc}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not specified</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 7. General Rules & Restrictions (Spanning all columns) */}
        <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-card p-4 sm:p-5 space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border pb-2.5">
            <AlertOctagon className="w-4 h-4 text-rose-500" />
            <h2 className="text-sm sm:text-base font-bold text-foreground">7. General Rules & Hard Restrictions</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-rose-500 block text-xs font-mono font-bold uppercase tracking-wider mb-2">Strict Restrictions:</span>
              {s?.general_rules.restrictions && s.general_rules.restrictions.length > 0 ? (
                <ul className="space-y-2">
                  {s.general_rules.restrictions.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-rose-600 dark:text-rose-200 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/25 text-xs sm:text-sm font-medium leading-snug">
                      <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground italic text-xs">No hard restrictions specified</span>
              )}
            </div>
            <div>
              <span className="text-emerald-500 block text-xs font-mono font-bold uppercase tracking-wider mb-2">Custom Agreements:</span>
              {s?.general_rules.custom_rules && s.general_rules.custom_rules.length > 0 ? (
                <ul className="space-y-2">
                  {s.general_rules.custom_rules.map((cr, i) => (
                    <li key={i} className="flex items-start gap-2 text-emerald-600 dark:text-emerald-200 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/25 text-xs sm:text-sm font-medium leading-snug">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{cr}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground italic text-xs">No custom agreements specified</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal (Owners only) */}
      {showEditModal && editSections && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="surface w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden border border-[#2a2a2a] shadow-2xl animate-scale-in">
            <div className="p-4 sm:p-5 border-b border-[#222] flex items-center justify-between bg-[#111]">
              <div className="flex items-center gap-2.5">
                <Edit3 className="w-4 h-4 text-[#10b981]" />
                <h2 className="text-sm sm:text-base font-bold text-[#fafafa]">
                  Edit Project Constitution (v{constitution?.version} → v{(constitution?.version || 1) + 1})
                </h2>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-[#737373] hover:text-[#fafafa] p-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section tabs */}
            <div className="flex border-b border-[#222] px-4 overflow-x-auto bg-[#0a0a0a]">
              {[
                { id: "tech", label: "1. Technology" },
                { id: "arch", label: "2. Architecture" },
                { id: "code", label: "3. Coding" },
                { id: "git", label: "4. Git" },
                { id: "api", label: "5. API" },
                { id: "ui", label: "6. Design/UI" },
                { id: "rules", label: "7. General Rules" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setEditTab(tab.id as "tech" | "arch" | "code" | "git" | "api" | "ui" | "rules")}
                  className={`py-3 px-3.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap cursor-pointer transition-colors ${editTab === tab.id
                      ? "border-[#10b981] text-[#fafafa] font-semibold"
                      : "border-transparent text-[#737373] hover:text-[#a3a3a3]"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {editTab === "tech" && (
                <div className="space-y-3.5">
                  <TagListEditor
                    label="Programming Languages"
                    tags={editSections.technology.languages}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        technology: { ...editSections.technology, languages: tags },
                      })
                    }
                    placeholder="e.g. TypeScript, Python, Rust"
                  />
                  <TagListEditor
                    label="Frameworks & Libraries"
                    tags={editSections.technology.frameworks}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        technology: { ...editSections.technology, frameworks: tags },
                      })
                    }
                    placeholder="e.g. Next.js, FastAPI, TailwindCSS"
                  />
                  <TagListEditor
                    label="Databases & Storage"
                    tags={editSections.technology.databases}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        technology: { ...editSections.technology, databases: tags },
                      })
                    }
                    placeholder="e.g. MongoDB, Qdrant, Redis"
                  />
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[#a3a3a3] mb-1.5">Notes / Additional Specs</label>
                    <textarea
                      value={editSections.technology.notes || ""}
                      onChange={(e) =>
                        setEditSections({
                          ...editSections,
                          technology: { ...editSections.technology, notes: e.target.value },
                        })
                      }
                      className="forge-input w-full p-3 text-xs sm:text-sm min-h-[70px]"
                      placeholder="Additional stack notes..."
                    />
                  </div>
                </div>
              )}

              {editTab === "arch" && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[#a3a3a3] mb-1.5">Architectural Style</label>
                    <input
                      type="text"
                      value={editSections.architecture.style || ""}
                      onChange={(e) =>
                        setEditSections({
                          ...editSections,
                          architecture: { ...editSections.architecture, style: e.target.value },
                        })
                      }
                      className="forge-input w-full px-3.5 py-2 text-xs sm:text-sm"
                      placeholder="e.g. Clean Architecture, Modular Monolith, Microservices"
                    />
                  </div>
                  <TagListEditor
                    label="Core Architecture Rules"
                    tags={editSections.architecture.rules}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        architecture: { ...editSections.architecture, rules: tags },
                      })
                    }
                    placeholder="e.g. Service layer required for business logic"
                  />
                  <TagListEditor
                    label="Service Boundaries & Layers"
                    tags={editSections.architecture.service_boundaries}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        architecture: { ...editSections.architecture, service_boundaries: tags },
                      })
                    }
                    placeholder="e.g. API -> Service -> Database"
                  />
                </div>
              )}

              {editTab === "code" && (
                <div className="space-y-3.5">
                  <TagListEditor
                    label="Naming Conventions"
                    tags={editSections.coding_standards.naming_conventions}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        coding_standards: { ...editSections.coding_standards, naming_conventions: tags },
                      })
                    }
                    placeholder="e.g. camelCase for TS variables, snake_case for Python"
                  />
                  <TagListEditor
                    label="Error Handling Guidelines"
                    tags={editSections.coding_standards.error_handling}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        coding_standards: { ...editSections.coding_standards, error_handling: tags },
                      })
                    }
                    placeholder="e.g. Catch unknown types and use explicit status codes"
                  />
                </div>
              )}

              {editTab === "git" && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[#a3a3a3] mb-1.5">Merge Strategy</label>
                    <input
                      type="text"
                      value={editSections.git_workflow.merge_strategy || ""}
                      onChange={(e) =>
                        setEditSections({
                          ...editSections,
                          git_workflow: { ...editSections.git_workflow, merge_strategy: e.target.value },
                        })
                      }
                      className="forge-input w-full px-3.5 py-2 text-xs sm:text-sm"
                      placeholder="e.g. Squash and merge, Rebase, Linear history"
                    />
                  </div>
                  <TagListEditor
                    label="Branch Naming Conventions"
                    tags={editSections.git_workflow.branch_naming}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        git_workflow: { ...editSections.git_workflow, branch_naming: tags },
                      })
                    }
                    placeholder="e.g. feature/*, fix/*, chore/*"
                  />
                  <TagListEditor
                    label="Commit Conventions"
                    tags={editSections.git_workflow.commit_conventions}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        git_workflow: { ...editSections.git_workflow, commit_conventions: tags },
                      })
                    }
                    placeholder="e.g. Conventional Commits (feat, fix, docs)"
                  />
                </div>
              )}

              {editTab === "api" && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[#a3a3a3] mb-1.5">API Paradigm / Style</label>
                    <input
                      type="text"
                      value={editSections.api_conventions.style || "REST"}
                      onChange={(e) =>
                        setEditSections({
                          ...editSections,
                          api_conventions: { ...editSections.api_conventions, style: e.target.value },
                        })
                      }
                      className="forge-input w-full px-3.5 py-2 text-xs sm:text-sm"
                      placeholder="e.g. REST, GraphQL, gRPC"
                    />
                  </div>
                  <TagListEditor
                    label="Endpoint Naming Rules"
                    tags={editSections.api_conventions.endpoint_naming}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        api_conventions: { ...editSections.api_conventions, endpoint_naming: tags },
                      })
                    }
                    placeholder="e.g. /api/v1/{plural-resources}, kebab-case routes"
                  />
                </div>
              )}

              {editTab === "ui" && (
                <div className="space-y-3.5">
                  <TagListEditor
                    label="Styling & Design System Conventions"
                    tags={editSections.design_ui_conventions.styling_conventions}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        design_ui_conventions: { ...editSections.design_ui_conventions, styling_conventions: tags },
                      })
                    }
                    placeholder="e.g. TailwindCSS v4, Dark mode first, Glassmorphism"
                  />
                  <TagListEditor
                    label="State Management Rules"
                    tags={editSections.design_ui_conventions.state_management}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        design_ui_conventions: { ...editSections.design_ui_conventions, state_management: tags },
                      })
                    }
                    placeholder="e.g. Zustand stores for global state"
                  />
                </div>
              )}

              {editTab === "rules" && (
                <div className="space-y-3.5">
                  <TagListEditor
                    label="Strict Technical Restrictions"
                    tags={editSections.general_rules.restrictions}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        general_rules: { ...editSections.general_rules, restrictions: tags },
                      })
                    }
                    placeholder="e.g. No raw database queries from API controllers"
                  />
                  <TagListEditor
                    label="Custom Team Agreements"
                    tags={editSections.general_rules.custom_rules}
                    onChange={(tags) =>
                      setEditSections({
                        ...editSections,
                        general_rules: { ...editSections.general_rules, custom_rules: tags },
                      })
                    }
                    placeholder="e.g. All backend endpoints must have automated pytest coverage"
                  />
                </div>
              )}

              {/* Change summary */}
              <div className="pt-3 border-t border-[#222]">
                <label className="block text-xs sm:text-sm font-semibold text-[#10b981] mb-1.5">
                  Change Summary (Recorded in Version History)
                </label>
                <input
                  type="text"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="e.g. Added PostgreSQL to stack and updated commit conventions"
                  className="forge-input w-full px-3.5 py-2 text-xs sm:text-sm"
                />
              </div>

              {saveError && <p className="text-red-400 text-xs sm:text-sm font-medium">{saveError}</p>}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-[#222] bg-[#111] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-lg border border-[#262626] text-[#a3a3a3] hover:text-[#fafafa] text-xs sm:text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConstitution}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Publish Version {(constitution?.version || 1) + 1}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="surface w-full max-w-xl max-h-[80vh] flex flex-col rounded-xl overflow-hidden border border-[#2a2a2a] shadow-2xl animate-scale-in">
            <div className="p-4 sm:p-5 border-b border-[#222] flex items-center justify-between bg-[#111]">
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-[#10b981]" />
                <h2 className="text-sm sm:text-base font-bold text-[#fafafa]">Constitution Version History</h2>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-[#737373] hover:text-[#fafafa] p-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {/* Active version */}
              <div className="p-3.5 rounded-xl bg-[#0e0e0e] border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-mono font-bold text-xs sm:text-sm">
                      v{constitution?.version}
                    </span>
                    <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono font-semibold">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-[#888] mt-1">
                    Updated {formatDateTime(constitution?.updated_at || "")} by {constitution?.updated_by}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedHistorySnapshot(null);
                    setShowHistoryModal(false);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#1c1c1c] text-[#fafafa] text-xs font-semibold hover:bg-[#282828] cursor-pointer"
                >
                  View Active
                </button>
              </div>

              {/* Historical versions */}
              {history.map((item) => (
                <div
                  key={item.id || item.version}
                  className="p-3.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-between"
                >
                  <div>
                    <span className="text-[#a3a3a3] font-mono font-semibold text-xs sm:text-sm">v{item.version}</span>
                    <p className="text-xs sm:text-sm text-[#fafafa] font-medium mt-0.5">
                      {item.change_summary || "Constitution update"}
                    </p>
                    <p className="text-xs text-[#666] mt-0.5">
                      {formatDateTime(item.updated_at)} by {item.updated_by}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedHistorySnapshot(item);
                      setShowHistoryModal(false);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#141414] text-[#a3a3a3] hover:text-[#fafafa] border border-[#262626] text-xs font-medium cursor-pointer"
                  >
                    View Snapshot
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
