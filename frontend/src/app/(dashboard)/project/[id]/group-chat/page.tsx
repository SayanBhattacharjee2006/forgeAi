"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  SmilePlus,
  Send,
  MoreHorizontal,
  CheckCheck,
  Check,
  Users,
  Loader2,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/use-auth-store";
import { useProjectStore } from "@/store/use-project-store";
import { cn } from "@/lib/utils";

interface GroupMessage {
  id?: string;
  message_id?: string;
  _id?: string;
  project_id: string;
  user_id: string;
  user_name?: string;
  content: string;
  created_at: string;
}

export default function GroupChatPage() {
  const { id } = useParams() as { id: string };
  const { user } = useAuthStore();
  const { currentProject, fetchProject } = useProjectStore();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [selectedSender, setSelectedSender] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionsMap, setReactionsMap] = useState<Record<string, Record<string, number>>>({});
  const [userReactions, setUserReactions] = useState<Record<string, Set<string>>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const data = await api.get<GroupMessage[]>(`/projects/${id}/group-chat`);
      setMessages(data || []);
    } catch (err) {
      console.error("Failed to fetch group chat messages:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchMessages();
      fetchProject(id);
      const interval = setInterval(fetchMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [id, fetchProject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedSender]);

  const toggleReaction = (messageKey: string, emoji: string) => {
    setUserReactions((prevUser) => {
      const msgUserReactions = new Set(prevUser[messageKey] || []);
      const hasReacted = msgUserReactions.has(emoji);

      if (hasReacted) {
        msgUserReactions.delete(emoji);
      } else {
        msgUserReactions.add(emoji);
      }

      setReactionsMap((prevMap) => {
        const msgMap = { ...(prevMap[messageKey] || {}) };
        const currentCount = msgMap[emoji] || 0;
        msgMap[emoji] = hasReacted ? Math.max(0, currentCount - 1) : currentCount + 1;
        return { ...prevMap, [messageKey]: msgMap };
      });

      return { ...prevUser, [messageKey]: msgUserReactions };
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    const messageContent = newMessage;
    setNewMessage("");

    try {
      const msg = await api.post<GroupMessage>(`/projects/${id}/group-chat`, {
        content: messageContent,
      });
      setMessages((prev) => [...prev, msg]);
    } catch (err) {
      console.error("Failed to send message:", err);
      setNewMessage(messageContent);
    } finally {
      setIsSending(false);
    }
  };

  // Build unique participants list from project members and message history
  const participants = (() => {
    const memberMap = new Map<
      string,
      { name: string; avatar: string | null; role: string; isOnline: boolean }
    >();

    // Add project members from store
    currentProject?.member_details?.forEach((m) => {
      const name = m.github_username || m.user_id;
      memberMap.set(name, {
        name,
        avatar: m.avatar_url,
        role: m.user_id === currentProject?.owner_id ? "Owner" : "Member",
        isOnline: true,
      });
    });

    // Also include any other senders in messages
    messages.forEach((msg) => {
      const name = msg.user_name || msg.user_id;
      if (name && !memberMap.has(name)) {
        memberMap.set(name, {
          name,
          avatar: null,
          role: msg.user_id === currentProject?.owner_id ? "Owner" : "Member",
          isOnline: true,
        });
      }
    });

    return Array.from(memberMap.values());
  })();

  // Filter messages by selected sender or show all
  const filteredMessages = selectedSender
    ? messages.filter((m) => (m.user_name || m.user_id) === selectedSender)
    : messages;

  return (
    <div className="h-[calc(100vh-3.5rem)] max-h-[calc(100vh-3.5rem)] p-3 sm:p-5 max-w-6xl w-full mx-auto flex flex-col overflow-hidden animate-fade-in bg-background text-foreground transition-colors duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-lg flex flex-col h-full max-h-full min-h-0 overflow-hidden p-4 sm:p-5">
        {/* Header */}
        <header className="flex justify-between items-center border-b border-border pb-3 mb-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href={`/project/${id}`}
              className="p-2 rounded-lg bg-card hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 shadow-2xs"
              title="Back to Project"
              aria-label="Back to Project"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center text-foreground shrink-0 shadow-2xs">
              <Users className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-foreground">
                {currentProject?.name ? `${currentProject.name} Team Chat` : "Team Chat"}
              </h1>
              <p className="text-xs text-muted-foreground italic mt-0.5">
                Collaborate creatively, deliver clearly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedSender && (
              <button
                onClick={() => setSelectedSender(null)}
                className="px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-accent border border-border transition-colors cursor-pointer"
              >
                Show All ({messages.length})
              </button>
            )}
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border text-muted-foreground text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync
            </span>
          </div>
        </header>

        {/* Body */}
        <main className="flex flex-1 min-h-0 h-full overflow-hidden rounded-xl border border-border bg-background">
          {/* Participants List */}
          <aside className="w-48 sm:w-56 bg-card/60 border-r border-border p-3 overflow-y-auto shrink-0 flex flex-col h-full min-h-0">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-mono mb-2 px-1">
              Participants ({participants.length})
            </div>
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              <button
                onClick={() => setSelectedSender(null)}
                className={cn(
                  "flex items-center justify-between w-full p-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                  selectedSender === null
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "hover:bg-accent text-foreground"
                )}
              >
                <span>All Messages</span>
                <span className="text-[11px] opacity-75 font-mono">{messages.length}</span>
              </button>

              {participants.map((sender) => {
                const isSelected = selectedSender === sender.name;
                const senderMsgCount = messages.filter(
                  (m) => (m.user_name || m.user_id) === sender.name
                ).length;

                return (
                  <button
                    key={sender.name}
                    onClick={() => setSelectedSender(isSelected ? null : sender.name)}
                    className={cn(
                      "flex items-center justify-between gap-2.5 w-full p-2.5 rounded-lg transition-colors cursor-pointer",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "hover:bg-accent text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        {sender.avatar ? (
                          <img
                            src={sender.avatar}
                            alt={sender.name}
                            className="w-7 h-7 rounded-full ring-1 ring-border object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-foreground ring-1 ring-border">
                            {sender.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-background",
                            sender.isOnline ? "bg-emerald-500" : "bg-zinc-400"
                          )}
                        />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-xs font-semibold truncate leading-tight">
                          {sender.name}
                        </p>
                        {sender.role && (
                          <p className="text-[10px] opacity-70 font-mono mt-0.5">
                            {sender.role}
                          </p>
                        )}
                      </div>
                    </div>
                    {senderMsgCount > 0 && (
                      <span className="text-[10px] font-mono opacity-70 shrink-0">
                        {senderMsgCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Messages Feed */}
          <section className="flex-1 min-h-0 h-full p-4 sm:p-6 overflow-y-auto bg-background flex flex-col">
            {isLoading && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center my-auto py-12 gap-2">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                <span className="text-xs text-muted-foreground">Loading team messages...</span>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center my-auto py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-3 text-muted-foreground shadow-2xs">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  {selectedSender ? `No messages from ${selectedSender}` : "No messages to display"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  {selectedSender
                    ? "This teammate hasn't sent any messages in this channel yet."
                    : "Be the first to share an update with your team."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMessages.map((message, idx) => {
                  const senderName = message.user_name || message.user_id || "Team Member";
                  const isMine = message.user_id === user?.user_id;
                  const memberDetail = currentProject?.member_details?.find(
                    (m) => m.user_id === message.user_id || m.github_username === message.user_name
                  );
                  const avatar = memberDetail?.avatar_url;
                  const formattedTime = new Date(message.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const key =
                    message.id ||
                    message.message_id ||
                    message._id ||
                    `${message.user_id}-${idx}`;

                  return (
                    <div
                      key={key}
                      className="border-b border-border/70 pb-4 last:border-b-0 group"
                    >
                      <div className="flex items-center gap-3 mb-1.5">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={senderName}
                            className="w-8 h-8 rounded-full ring-1 ring-border object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold text-foreground shrink-0 shadow-2xs">
                            {senderName.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs sm:text-sm text-foreground">
                            {senderName}
                          </span>
                          {message.user_id === currentProject?.owner_id && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-mono">
                              Owner
                            </span>
                          )}
                          {isMine && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              (You)
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground font-mono">
                            {formattedTime}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-foreground/90 pl-11 mb-2 whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>

                      <div className="flex items-center justify-between text-xs text-muted-foreground pl-11">
                        <div className="flex items-center gap-1 font-mono">
                          <CheckCheck className="w-4 h-4 text-emerald-500" />
                          <span>{formattedTime}</span>
                        </div>

                        {/* Reaction buttons */}
                        <div className="flex items-center gap-1.5">
                          {["👍", "🙌", "🔥", "✨"].map((emoji) => {
                            const reaction = reactionsMap[key]?.[emoji] || 0;
                            const hasReacted = userReactions[key]?.has(emoji);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(key, emoji)}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-xs transition-colors border cursor-pointer",
                                  hasReacted
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold"
                                    : reaction > 0
                                    ? "bg-card border-border text-foreground hover:bg-accent"
                                    : "opacity-0 group-hover:opacity-100 bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                                )}
                              >
                                {emoji}{" "}
                                {reaction > 0 && (
                                  <span className="ml-1 font-mono">{reaction}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </section>
        </main>

        {/* Footer */}
        <footer className="mt-4 flex items-center gap-3 border-t border-border pt-4 shrink-0">
          <div className="relative">
            <button
              type="button"
              aria-label="Add emoji"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-3 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer"
            >
              <SmilePlus className="w-5 h-5" />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-14 left-0 bg-card border border-border p-2 rounded-xl shadow-lg flex gap-1 z-30 animate-scale-in">
                {["👍", "🙌", "🔥", "✨", "🚀", "❤️", "💡", "🎉"].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setNewMessage((prev) => prev + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="p-1.5 text-base hover:bg-accent rounded-lg transition-colors cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Write your message..."
              disabled={isSending}
              className={cn(
                "flex-1 px-5 py-3 rounded-full border border-border bg-card text-foreground placeholder:text-muted-foreground text-xs sm:text-sm",
                "focus:outline-none focus:ring-2 focus:ring-ring transition-colors shadow-2xs disabled:opacity-50"
              )}
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!newMessage.trim() || isSending}
              className="p-3 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-all shadow-2xs cursor-pointer flex items-center justify-center shrink-0"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
