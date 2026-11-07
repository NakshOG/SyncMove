"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Pencil, Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatInput } from "./chat-input";
import { useSocket } from "@/components/providers/socket-provider";
import { useE2EEContext } from "@/components/providers/e2ee-provider";
import { ChatMessagesSkeleton } from "./chat-messages-skeleton";
import { ChatEmptyState } from "./chat-empty-state";
import { RelativeTimestamp } from "@/components/ui/relative-timestamp";

type ChatMessage = {
  id: string;
  content: string;
  fileUrl: string | null;
  deleted: boolean;
  pinned: boolean;
  CreatedAt: string;
  encrypted: boolean;
  member: { profileId: string; profile: { name: string; imageUrl: string } };
};

export const ChatMessages = ({ channelId, profileId }: { channelId: string; profileId: string }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [showPinned, setShowPinned] = useState(false);
  const [decryptedCache] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  
  const { socket, isConnected } = useSocket();
  const { decryptFromChannel, initialized } = useE2EEContext();

  const load = useCallback(async (before?: string) => {
    const query = new URLSearchParams({ channelId, limit: "10" });
    if (before) query.set("before", before);
    try {
      const response = await fetch(/api/messages?, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { messages: ChatMessage[]; hasMore: boolean };
      setHasMore(data.hasMore);
      setMessages((current) => before ? [...data.messages, ...current] : data.messages);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [channelId]);

  const getDecryptedContent = useCallback(async (message: ChatMessage): Promise<string> => {
    if (decryptedCache.has(message.id)) {
      return decryptedCache.get(message.id)!;
    }

    if (!message.encrypted || !initialized) {
      return message.content;
    }

    try {
      const decrypted = await decryptFromChannel(channelId, message.content);
      const finalContent = decrypted ?? message.content;
      decryptedCache.set(message.id, finalContent);
      return finalContent;
    } catch (error) {
      console.error("[ChatMessages] Decryption error:", error);
      return message.content;
    }
  }, [channelId, decryptFromChannel, initialized, decryptedCache]);

  useEffect(() => {
    const init = setTimeout(() => void load(), 0);
    const interval = !socket || !isConnected ? window.setInterval(() => void load(), 3000) : null;
    
    return () => {
      clearTimeout(init);
      if (interval) clearInterval(interval);
    };
  }, [channelId, isConnected, load, socket]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const receive = async (event: { type: "created" | "updated" | "deleted"; message: ChatMessage }) => {
      if (event.type === "created") {
        setMessages((current) => {
          const found = current.some((message) => message.id === event.message.id);
          if (found) return current;
          return [...current, event.message];
        });
      } else if (event.type === "updated" || event.type === "deleted") {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.message.id ? event.message : message
          )
        );
      }
    };

    socket.emit("join-channel", channelId);
    socket.on("message-event", receive);
    return () => {
      socket.emit("leave-channel", channelId);
      socket.off("message-event", receive);
    };
  }, [channelId, isConnected, socket]);

  useEffect(() => {
    const receiveSearch = async (event: Event) => {
      const query = (event as CustomEvent<{ query: string }>).detail.query.trim();
      setSearchQuery(query);
      if (!query) {
        setSearchResults([]);
        return;
      }
      
      try {
        const response = await fetch(/api/messages?channelId=&q=&limit=50, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { messages: ChatMessage[] };
        
        // Decrypt results if needed
        const decrypted = await Promise.all(
          data.messages.map(async (msg) => {
            if (msg.encrypted && initialized) {
              msg.content = await getDecryptedContent(msg);
            }
            return msg;
          })
        );
        setSearchResults(decrypted);
      } catch {
        setSearchResults([]);
      }
    };

    const receivePinned = (event: Event) => setShowPinned((event as CustomEvent<{ show: boolean }>).detail.show);
    window.addEventListener("syncmove:channel-search", receiveSearch);
    window.addEventListener("syncmove:show-pinned", receivePinned);
    return () => {
      window.removeEventListener("syncmove:channel-search", receiveSearch);
      window.removeEventListener("syncmove:show-pinned", receivePinned);
    };
  }, [channelId, initialized, getDecryptedContent]);

  const remove = async (id: string) => { await fetch(/api/messages/, { method: "DELETE" }); await load(); };
  const save = async (id: string) => { 
    await fetch(/api/messages/, { 
      method: "PATCH", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ content: editValue }) 
    }); 
    setEditing(null); 
    await load(); 
  };
  const togglePin = async (message: ChatMessage) => { 
    await fetch(/api/messages/, { 
      method: "PATCH", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ pinned: !message.pinned }) 
    }); 
    await load(); 
  };

  const displayedMessages = (searchQuery ? searchResults : messages).filter((message) => !showPinned || message.pinned);

  if (loading) {
    return (
      <div className="flex h-0 min-h-0 flex-1 flex-col bg-transparent dark:bg-[#1e1f22]">
        <div className="h-0 min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
          <ChatMessagesSkeleton />
        </div>
        <ChatInput channelId={channelId} onSent={() => void load()} />
      </div>
    );
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-transparent dark:bg-[#1e1f22]">
      <div className="h-0 min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 scrollbar-thin">
        {hasMore && (
          <Button 
            variant="ghost" 
            className="mb-3 w-full hover:bg-[#35373c] transition-colors" 
            onClick={() => messages[0] && load(messages[0].CreatedAt)}
          >
            Load older messages
          </Button>
        )}
        
        <div className="space-y-1">
          {displayedMessages.length === 0 && (
            <ChatEmptyState 
              onSendMessage={() => {
                const input = document.querySelector('input[placeholder*="Message this channel"]') as HTMLInputElement;
                input?.focus();
              }}
            />
          )}
          
          {displayedMessages.map(async (message) => {
            const displayContent = await getDecryptedContent(message);
            
            return (
              <article 
                key={message.id} 
                className="group -mx-2 flex gap-3 rounded-md px-2 py-1.5 transition hover:bg-[#2b2d31]"
              >
                <Image
                  src={message.member.profile.imageUrl}
                  alt={message.member.profile.name}
                  width={40}
                  height={40}
                  unoptimized
                  className="mt-0.5 h-10 w-10 shrink-0 rounded-full"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-white">{message.member.profile.name}</span>
                    <RelativeTimestamp date={message.CreatedAt} />
                    {message.encrypted && initialized && (
                      <span className="text-[10px] text-[#23a559]" title="End-to-end encrypted">🔒</span>
                    )}
                    {message.pinned && <Pin className="h-3 w-3 text-[#a5b4fc]" />}
                    {message.deleted && <span className="text-[10px] text-[#949ba4]">deleted</span>}
                  </div>
                  
                  {editing === message.id ? (
                    <div className="mt-1 flex gap-2">
                      <Input 
                        value={editValue} 
                        onChange={(event) => setEditValue(event.target.value)} 
                        className="rounded-xl bg-[#111214] text-white border-0 focus-visible:ring-1 focus-visible:ring-[#5865f2]" 
                      />
                      <Button size="sm" onClick={() => save(message.id)} className="rounded-xl bg-[#5865f2]">Save</Button>
                    </div>
                  ) : (
                    <p className={message.deleted ? "italic text-[#949ba4]" : "whitespace-pre-wrap break-words text-[#f2f3f5]"}>
                      {displayContent}
                    </p>
                  )}
                  
                  {message.fileUrl && (
                    <a 
                      className="mt-1 inline-block text-sm text-[#a5b4fc] hover:underline" 
                      href={message.fileUrl} 
                      target="_blank" 
                      rel="noreferrer"
                    >
                      View attachment
                    </a>
                  )}
                </div>
                
                {!message.deleted && (
                  <div className="hidden gap-1 rounded-lg border border-[#111214] bg-[#2b2d31] p-1 shadow group-hover:flex">
                    <Button 
                      size="icon-xs" 
                      variant="ghost" 
                      title={message.pinned ? "Unpin message" : "Pin message"} 
                      onClick={() => void togglePin(message)}
                      className="rounded hover:bg-[#35373c] transition-colors"
                    >
                      <Pin className={message.pinned ? "text-[#a5b4fc]" : ""} />
                    </Button>
                    <Button 
                      size="icon-xs" 
                      variant="ghost" 
                      title="Edit message" 
                      onClick={() => { setEditing(message.id); setEditValue(displayContent); }}
                      className="rounded hover:bg-[#35373c] transition-colors"
                    >
                      <Pencil />
                    </Button>
                    <Button 
                      size="icon-xs" 
                      variant="ghost" 
                      title="Delete message" 
                      onClick={() => void remove(message.id)}
                      className="rounded hover:bg-[#f23f42] hover:text-white transition-colors"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      
      <ChatInput channelId={channelId} onSent={() => void load()} />
    </div>
  );
};