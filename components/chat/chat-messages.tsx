"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Pencil, Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatInput } from "./chat-input";
import { useSocket } from "@/components/providers/socket-provider";

type ChatMessage = { id: string; content: string; fileUrl: string | null; deleted: boolean; pinned: boolean; CreatedAt: string; member: { profileId: string; profile: { name: string; imageUrl: string } } };

export const ChatMessages = ({ channelId, profileId }: { channelId: string; profileId: string }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [showPinned, setShowPinned] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted");
  const { socket, isConnected } = useSocket();
  const load = useCallback(async (before?: string) => {
    const query = new URLSearchParams({ channelId, limit: "10" });
    if (before) query.set("before", before);
    try {
      const response = await fetch(`/api/messages?${query}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { messages: ChatMessage[]; hasMore: boolean };
      setHasMore(data.hasMore);
      setMessages((current) => before ? [...data.messages, ...current] : data.messages);
    } catch {
      // Navigation, tab suspension, or a temporary network interruption can
      // abort fetch. Socket.IO or the next polling tick will recover state.
    }
  }, [channelId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    if (!socket || !isConnected) {
      const timer = window.setInterval(() => void load(), 3000);
      return () => { window.clearTimeout(initial); window.clearInterval(timer); };
    }
    const receive = (event: { type: "created" | "updated" | "deleted"; message: ChatMessage }) => {
      if (event.type === "created" && notificationsEnabled && document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification("New channel message", { body: `${event.message.member.profile.name}: ${event.message.content.slice(0, 100)}` });
      }
      setMessages((current) => {
        const found = current.some((message) => message.id === event.message.id);
        if (event.type === "created" && !found) return [...current, event.message];
        return current.map((message) => message.id === event.message.id ? event.message : message);
      });
    };
    socket.emit("join-channel", channelId);
    socket.on("message-event", receive);
    return () => { window.clearTimeout(initial); socket.emit("leave-channel", channelId); socket.off("message-event", receive); };
  }, [channelId, isConnected, load, notificationsEnabled, socket]);
  useEffect(() => {
    const receiveNotificationState = (event: Event) => setNotificationsEnabled((event as CustomEvent<{ enabled: boolean }>).detail.enabled);
    const receiveSearch = (event: Event) => {
      const query = (event as CustomEvent<{ query: string }>).detail.query.trim();
      setSearchQuery(query);
      if (!query) {
        setSearchResults([]);
        return;
      }
      void fetch(`/api/messages?channelId=${encodeURIComponent(channelId)}&q=${encodeURIComponent(query)}&limit=50`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<{ messages: ChatMessage[] }> : { messages: [] })
        .then((data) => setSearchResults(data.messages));
    };
    const receivePinned = (event: Event) => setShowPinned((event as CustomEvent<{ show: boolean }>).detail.show);
    window.addEventListener("syncmove:notifications", receiveNotificationState);
    window.addEventListener("syncmove:channel-search", receiveSearch);
    window.addEventListener("syncmove:show-pinned", receivePinned);
    return () => {
      window.removeEventListener("syncmove:notifications", receiveNotificationState);
      window.removeEventListener("syncmove:channel-search", receiveSearch);
      window.removeEventListener("syncmove:show-pinned", receivePinned);
    };
  }, [channelId]);
  const remove = async (id: string) => { await fetch(`/api/messages/${id}`, { method: "DELETE" }); await load(); };
  const save = async (id: string) => { await fetch(`/api/messages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editValue }) }); setEditing(null); await load(); };
  const togglePin = async (message: ChatMessage) => { await fetch(`/api/messages/${message.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !message.pinned }) }); await load(); };
  const displayedMessages = (searchQuery ? searchResults : messages).filter((message) => !showPinned || message.pinned);
  return <div className="flex h-0 min-h-0 flex-1 flex-col bg-transparent dark:bg-[#1e1f22]"><div className="h-0 min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
    {hasMore && <Button variant="ghost" className="mb-3 w-full" onClick={() => messages[0] && load(messages[0].CreatedAt)}>Load older messages</Button>}
    <div className="space-y-1">{displayedMessages.length === 0 && <div className="flex h-full min-h-64 flex-col items-center justify-center text-center"><div className="mb-3 rounded-full bg-[#5865f2]/15 p-4 text-[#a5b4fc]"><Pencil className="h-6 w-6" /></div><h2 className="text-lg font-semibold text-white">{searchQuery ? "No messages found" : showPinned ? "No pinned messages" : "Welcome to the channel"}</h2><p className="mt-1 max-w-sm text-sm text-[#949ba4]">{searchQuery ? `Nothing matched “${searchQuery}”.` : showPinned ? "Pin important messages to find them here." : "This is the beginning of the conversation. Send a message to get things moving."}</p></div>}{displayedMessages.map((message) => { const own = message.member.profileId === profileId; return <article key={message.id} className="group -mx-2 flex gap-3 rounded-md px-2 py-1.5 transition hover:bg-[#2b2d31]"><Image src={message.member.profile.imageUrl} alt={message.member.profile.name} width={40} height={40} unoptimized className="mt-0.5 h-10 w-10 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><div className="flex items-baseline gap-2"><span className="font-semibold text-white">{message.member.profile.name}</span><time className="text-[11px] text-[#949ba4]">{new Date(message.CreatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.pinned && <Pin className="h-3 w-3 text-[#a5b4fc]" />}{message.deleted && <span className="text-[10px] text-[#949ba4]">deleted</span>}</div>{editing === message.id ? <div className="mt-1 flex gap-2"><Input value={editValue} onChange={(event) => setEditValue(event.target.value)} className="bg-[#111214] text-white" /><Button size="sm" onClick={() => save(message.id)}>Save</Button></div> : <p className={message.deleted ? "italic text-[#949ba4]" : "whitespace-pre-wrap break-words text-[#f2f3f5]"}>{message.content}</p>}{message.fileUrl && <a className="mt-1 inline-block text-sm text-[#a5b4fc] underline" href={message.fileUrl} target="_blank" rel="noreferrer">View attachment</a>}</div>{!message.deleted && (own || true) && <div className="hidden gap-1 rounded-md border border-[#111214] bg-[#2b2d31] p-0.5 shadow group-hover:flex"><Button size="icon-xs" variant="ghost" title={message.pinned ? "Unpin message" : "Pin message"} onClick={() => void togglePin(message)}><Pin className={message.pinned ? "text-[#a5b4fc]" : ""} /></Button><Button size="icon-xs" variant="ghost" title="Edit message" onClick={() => { setEditing(message.id); setEditValue(message.content); }}><Pencil /></Button><Button size="icon-xs" variant="ghost" title="Delete message" onClick={() => void remove(message.id)}><Trash2 /></Button></div>}</article>; })}</div>
  </div><ChatInput channelId={channelId} onSent={() => void load()} /></div>;
};
