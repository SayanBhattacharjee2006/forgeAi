"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Loader2,
  ChevronDown,
  Bot,
  Wifi,
  WifiOff,
  ScrollText,
  Users,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/use-auth-store";
import { useProjectStore } from "@/store/use-project-store";
import { ChatMessage, SourceCitation } from "@/types";

function formatRelativeTime(isoString: string): string {
  if (!isoString) return "Just now";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "Recently";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Recently";
  }
}

export default function UnifiedChatPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { user, token } = useAuthStore();
  const { currentProject, fetchProject } = useProjectStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "reconnecting" | "disconnected">("connecting");
  const [aiThinking, setAiThinking] = useState<{ active: boolean; aiName: string } | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const aiName = currentProject?.ai_config?.name || "Forge";
  const aiInvocation = currentProject?.ai_config?.invocation_phrase || aiName;

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId, true);
      api
        .get<ChatMessage[]>(`/projects/${projectId}/chat/messages?limit=60`)
        .then((data) => setMessages(data || []))
        .catch((err) => console.error("Failed to load chat history:", err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [projectId, fetchProject]);

  const connectWebSocketRef = useRef<() => void>(() => {});

  // WebSocket Connection
  const connectWebSocket = useCallback(() => {
    let activeToken = token;
    if (!activeToken && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("forge-auth");
        if (raw) {
          const parsed = JSON.parse(raw);
          activeToken = parsed?.state?.token;
        }
        if (!activeToken) {
          activeToken = localStorage.getItem("token");
        }
      } catch {}
    }
    if (!activeToken) {
      activeToken = api.getToken();
    }

    if (!projectId || !activeToken) {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocketRef.current();
      }, 1000);
      return;
    }

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {}
      socketRef.current = null;
    }

    // Build WS URL matching exact host - prefer 127.0.0.1 on local dev for IPv4 stability
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let wsHost = "127.0.0.1:8000";
    if (process.env.NEXT_PUBLIC_BACKEND_URL) {
      wsHost = process.env.NEXT_PUBLIC_BACKEND_URL.replace(/^http(s)?:\/\//, "").replace(/\/api\/v1\/?$/, "");
    } else if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      wsHost = hostname === "localhost" ? "127.0.0.1:8000" : `${hostname}:8000`;
    }

    const wsUrl = `${protocol}//${wsHost}/api/v1/projects/${projectId}/ws?token=${activeToken}`;
    
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "message" && payload.data) {
            const newMsg: ChatMessage = payload.data;
            setMessages((prev) => {
              if (prev.some((m) => m.message_id === newMsg.message_id || (newMsg.id && m.id === newMsg.id))) {
                return prev;
              }
              return [...prev, newMsg];
            });
            if (newMsg.role === "assistant" || newMsg.is_ai_generated) {
              setAiThinking(null);
            }
          } else if (payload.type === "ai_thinking") {
            setAiThinking({ active: true, aiName: payload.ai_name || "Forge" });
          } else if (payload.type === "presence") {
            if (payload.online_count) {
              setOnlineCount(payload.online_count);
            }
          }
        } catch (e) {
          console.warn("Failed to parse WS message:", e);
        }
      };

      ws.onclose = () => {
        setConnectionStatus("disconnected");
        socketRef.current = null;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          setConnectionStatus("reconnecting");
          connectWebSocketRef.current();
        }, 3000);
      };

      ws.onerror = () => {
        console.warn("[UnifiedChat] WebSocket connection interrupted, reconnecting...");
      };
    } catch (err) {
      console.warn("[UnifiedChat] Error initializing WebSocket:", err);
    }
  }, [projectId, token]);

  useEffect(() => {
    connectWebSocketRef.current = connectWebSocket;
  }, [connectWebSocket]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiThinking]);

  const toggleSources = (messageId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleSend = async (textOverride?: string) => {
    const messageText = (textOverride || input).trim();
    if (!messageText || isSending) return;

    setIsSending(true);
    setInput("");

    const isAiInvoked = /@|forge|ai|bot|assistant/i.test(messageText);
    if (isAiInvoked) {
      setAiThinking({ active: true, aiName });
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ content: messageText }));
      setIsSending(false);
    } else {
      try {
        const sentMsg = await api.post<ChatMessage>(`/projects/${projectId}/chat/messages`, {
          content: messageText,
        });
        setMessages((prev) => {
          if (prev.some((m) => m.message_id === sentMsg.message_id)) return prev;
          return [...prev, sentMsg];
        });

        // Fast poll for AI response if invoked
        if (isAiInvoked) {
          setTimeout(async () => {
            try {
              const freshMsgs = await api.get<ChatMessage[]>(`/projects/${projectId}/chat/messages?limit=10`);
              if (freshMsgs && freshMsgs.length > 0) {
                setMessages(freshMsgs);
                setAiThinking(null);
              }
            } catch {}
          }, 1200);
        }
      } catch (err) {
        console.error("Failed to send message via REST fallback:", err);
        setAiThinking(null);
      } finally {
        setIsSending(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQueries = [
    `@${aiInvocation} what is our Project Constitution stack?`,
    `@${aiInvocation} what are our Git branch and commit rules?`,
    `@${aiInvocation} explain our service architecture rules`,
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-h-[calc(100vh-56px)] overflow-hidden bg-background text-foreground transition-colors duration-200">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-border bg-card/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${projectId}`}
            className="p-1.5 rounded-md bg-card hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 shadow-xs"
            title="Back to Project"
            aria-label="Back to Project"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base sm:text-lg font-bold text-foreground truncate">
                {currentProject?.name || "Project"} — Unified Chat
              </h1>
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <Bot className="w-3.5 h-3.5" />
                @{aiInvocation}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Team collaboration with embedded Project Memory & Constitution grounding
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={`/project/${projectId}/constitution`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm text-muted-foreground hover:text-foreground bg-secondary border border-border transition-colors font-medium"
          >
            <ScrollText className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Constitution</span>
          </Link>

          {/* Connection Status Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-background border border-border">
            {connectionStatus === "connected" ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-500 font-semibold">Live ({onlineCount})</span>
              </>
            ) : connectionStatus === "reconnecting" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                <span className="text-amber-500">Reconnecting</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" strokeWidth={2} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-3 text-emerald-500 shadow-xs">
                <Users className="w-6 h-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-base font-bold text-foreground mb-1">
                Welcome to #{currentProject?.name || "Project"} Chat
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm max-w-md mb-6">
                Send messages to your teammates, or type <strong className="text-emerald-600 dark:text-emerald-400 font-mono">@{aiInvocation}</strong> to
                consult the AI assistant with Project Constitution rules and vector memory.
              </p>

              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {suggestedQueries.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(q)}
                    className="px-3 py-1.5 rounded-md border border-border bg-card text-xs font-mono text-muted-foreground hover:text-foreground hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors cursor-pointer shadow-xs"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isAssistant = msg.role === "assistant" || msg.is_ai_generated;
              const isMine = msg.user_id === user?.user_id;

              return (
                <div
                  key={msg.message_id || msg.id}
                  className={`flex gap-3 ${isMine && !isAssistant ? "justify-end" : "justify-start"}`}
                >
                  {/* Assistant Avatar */}
                  {isAssistant && (
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5 text-emerald-500 shadow-xs">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  {/* Message Bubble Container */}
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] ${
                      isAssistant
                        ? "p-4 rounded-xl bg-card border border-emerald-500/20 text-foreground shadow-xs"
                        : isMine
                          ? "p-3.5 rounded-xl bg-primary text-primary-foreground font-medium shadow-xs"
                          : "p-3.5 rounded-xl bg-card border border-border text-foreground shadow-xs"
                    }`}
                  >
                    {/* Header: Sender Name & Timestamp */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`text-xs font-bold ${
                          isAssistant ? "text-emerald-600 dark:text-emerald-400" : isMine ? "text-primary-foreground font-semibold" : "text-foreground"
                        }`}
                      >
                        {isAssistant ? `${aiName} (AI Assistant)` : msg.user_name || msg.user_id}
                      </span>
                      {msg.is_ai_invocation && !isAssistant && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1 py-0.25 rounded font-mono">
                          AI Mention
                        </span>
                      )}
                      <span className={`text-[10px] font-mono ${isMine ? "opacity-75" : "text-muted-foreground"}`}>
                        {formatRelativeTime(msg.created_at)}
                      </span>
                    </div>

                    {/* Content */}
                    <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                    {/* Source Citations for AI Assistant */}
                    {isAssistant && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-border">
                        <button
                          onClick={() => toggleSources(msg.message_id)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-emerald-500 transition-colors cursor-pointer"
                        >
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              expandedSources.has(msg.message_id) ? "rotate-180" : ""
                            }`}
                          />
                          <span>
                            {msg.sources.length} cited source{msg.sources.length !== 1 ? "s" : ""} (including
                            Constitution & Knowledge Base)
                          </span>
                        </button>

                        {expandedSources.has(msg.message_id) && (
                          <div className="mt-2 space-y-2">
                            {msg.sources.map((src: SourceCitation, i: number) => (
                              <div
                                key={i}
                                className="p-2.5 rounded-lg bg-background border border-border text-xs space-y-1 font-mono"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                                    [{src.source_type.toUpperCase()}] {src.source_id}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {Math.round(src.relevance_score * 100)}% match
                                  </span>
                                </div>
                                {src.content_preview && (
                                  <p className="text-muted-foreground line-clamp-2">{src.content_preview}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Human User Avatar */}
                  {!isAssistant && !isMine && (
                    <div className="w-7 h-7 rounded-full bg-accent border border-border flex items-center justify-center shrink-0 mt-0.5 text-[10px] text-foreground font-bold">
                      {(msg.user_name || "??").substring(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* AI Thinking State */}
          {aiThinking?.active && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-card border border-emerald-500/20 max-w-[85%] shadow-xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{aiThinking.aiName}</span>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                  Reviewing Project Constitution rules & memory...
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Composer */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-border bg-background">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Quick Suggestions Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs sm:text-sm no-scrollbar">
            <span className="text-xs text-muted-foreground shrink-0 font-medium mr-0.5">Ask {aiName}:</span>
            <button
              type="button"
              onClick={() => {
                const prefix = `@${aiInvocation} `;
                if (!input.startsWith(prefix)) {
                  setInput(prefix + input);
                }
              }}
              className="px-2.5 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-mono font-medium shrink-0 cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <Bot className="w-3.5 h-3.5" />
              @{aiInvocation}
            </button>
            <button
              type="button"
              onClick={() => handleSend(`@${aiInvocation} summarize our active stack & decisions`)}
              className="px-3 py-1 rounded-full bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border text-xs shrink-0 cursor-pointer transition-colors"
            >
              Summarize stack & decisions
            </button>
            <button
              type="button"
              onClick={() => handleSend(`@${aiInvocation} what are our project conventions?`)}
              className="px-3 py-1 rounded-full bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border text-xs shrink-0 cursor-pointer transition-colors"
            >
              Project conventions
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl p-2 bg-card border border-border shadow-xs focus-within:border-ring transition-colors">
            <button
              type="button"
              onClick={() => {
                const tag = `@${aiInvocation} `;
                if (input.includes(tag)) {
                  setInput(input.replace(tag, ""));
                } else {
                  setInput(tag + input);
                }
              }}
              title={`Toggle @${aiInvocation}`}
              className={`p-1.5 rounded-lg border text-xs font-mono font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                input.includes(`@${aiInvocation}`)
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-background text-muted-foreground hover:text-foreground border-border hover:bg-accent"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">@{aiInvocation}</span>
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message team, or type @${aiInvocation} to ask AI copilot...`}
              className="flex-1 bg-transparent border-none outline-none text-xs sm:text-sm text-foreground placeholder:text-muted-foreground px-1"
              disabled={isSending}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isSending}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 text-xs font-semibold shrink-0 shadow-xs"
            >
              {isSending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Forge AI connected & grounded in Project Memory
            </span>
            <span>{connectionStatus === "connected" ? "Realtime Active" : "Reconnecting..."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
