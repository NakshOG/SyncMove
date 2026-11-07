"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import { Pencil, Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatInput } from "./chat-input";
import { useSocket } from "@/components/providers/socket-provider";
import { useE2EEContext } from "@/components/providers/e2ee-provider";

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
  const [decryptedCache, setDecryptedCache] = useState<Map<string, string>>(new Map());
  
  const { socket, isConnected } = useSocket();
  const { decryptFromChannel, initialized } = useE2EEContext();

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
      // Navigation, tab suspension, or a temporary network interruption can abort fetch.
    }
  }, [channelId]);

  /**
   * Decrypt a message if it's encrypted
   */
  const getDecryptedContent = useCallback(async (message: ChatMessage): Promise<string> => {
    // Return from cache if available
    if (decryptedCache.has(message.id)) {
      return decryptedCache.get(message.id)!;
    }

    // If not encrypted or E2EE not ready, return as-is
    if (!message.encrypted || !initialized) {
      return message.content;
    }

    try {
      const decrypted = await decryptFromChannel(channelId, message.content);
      const finalContent = decrypted ?? message.content;
      
      // Cache the result
      setDecryptedCache((prev) => new Map(prev).set(message.id, finalContent));
      
      return finalContent;
    } catch (error) {
      console.error("[ChatMessages] Decryption error:", error);
      return message.content;
    }
  }, [channelId, decryptFromChannel, initialized, decryptedCache]);

  /**
   * Decrypt search results
   */
  const decryptSearchResults = useCallback(async (msgs: ChatMessage[]): Promise<ChatMessage[]> => {
    if (!initialized) return msgs;
    
    return Promise.all(
      msgs.map(async (msg) => {
        if (msg.encrypted) {
          const decrypted = await getDecryptedContent(msg);
          return { ...msg, content: decrypted };
        }
        return msg;
      })
    );
  }, [initialized, getDecryptedContent]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    
    if (!socket || !isConnected) {
      const timer = window.setInterval(() => void load(), 3000);
      return () => { window.clearTimeout(initial); window.clearInterval(timer); };
    }

    const receive = async (event: { type: "created" | "updated" | "deleted"; message: ChatMessage }) => {
      if (event.type === "created") {
        // Update messages list
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
    return () => { window.clearTimeout(initial); socket.emit("leave-channel", channelId); socket.off("message-event", receive); };
  }, [channelId, isConnected, load, socket]);

  useEffect(() => {
    const receiveSearch = async (event: Event) => {
      const query = (event as CustomEvent<{ query: string }>).detail.query.trim();
      setSearchQuery(query);
      if (!query) {
        setSearchResults([]);
        return;
      }
      
      try {
        const response = await fetch(`/api/messages?channelId=${encodeURIComponent(channelId)}&q=${encodeURIComponent(query)}&limit=50`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { messages: ChatMessage[] };
        const decrypted = await decryptSearchResults(data.messages);
        setSearchResults(decrypted);
      } catch {
        setSearchResults([]);
      }
    };

    const receivePinned = (event: Event) => setShowPinned((event as CustomEvent<{ show: boolean }>).detail.show);
    window.addEventListener("syncmove:channel-search", receiveSearch);
    window.addEventListener("syncmove:show-pinned", receivePinned);
    return () => { window.removeEventListener("syncmove:channel-search", receiveSearch); window.removeEventListener("syncmove:show-pinned", receivePinned); };
  }, [channelId, decryptSearchResults]);

  const remove = async (id: string) => { await fetch(`/api/messages/${id}`, { method: "DELETE" }); await load(); };
  const save = async (id: string) => { await fetch(`/api/messages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editValue }) }); setEditing(null); await load(); };
  const togglePin = async (message: ChatMessage) => { await fetch(`/api/messages/${message.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !message.pinned }) }); await load(); };

  const displayedMessages = (searchQuery ? searchResults : messages).filter((message) => !showPinned || message.pinned);

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-transparent dark:bg-[#1e1f22]">
      <div className="h-0 min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
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
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-full bg-[#5865f2]/15 p-4 text-[#a5b4fc]">
                <Pencil className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-white">
                {searchQuery ? "No messages found" : showPinned ? "No pinned messages" : "Welcome to the channel"}
              </h2>
              <p className="mt-1 max-w-sm text-sm text-[#949ba4]">
                {searchQuery 
                  ? `Nothing matched "${searchQuery}".` 
                  : showPinned 
                    ? "Pin important messages to find them here." 
                    : "This is the beginning of the conversation. Send a message to get things moving."}
              </p>
            </div>
          )}
          
          {displayedMessages.map(async (message) => {
            const own = message.member.profileId === profileId;
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
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-white">{message.member.profile.name}</span>
                    <time className="text-[11px] text-[#949ba4]">
                      {new Date(message.CreatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
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
                
                {!message.deleted && (own || true) && (
                  <div className="hidden gap-1 rounded-lg border border-[#111214] bg-[#2b2d31] p-1 shadow group-hover:flex">
                    <Button 
                      size="icon-xs" 
                      variant="ghost" 
                      title={message.pinned ? "Unpin message" : "Pin message"} 
                      onClick={() => void togglePin(message)}
                      className="rounded hover:bg-[#35373c]"
                    >
                      <Pin className={message.pinned ? "text-[#a5b4fc]" : ""} />
                    </Button>
                    <Button 
                      size="icon-xs" 
                      variant="ghost" 
                      title="Edit message" 
                      onClick={() => { setEditing(message.id); setEditValue(displayContent); }}
                      className="rounded hover:bg-[#35373c]"
                    >
                      <Pencil />
                    </Button>
                    <Button 
                      size="icon-xs" 
                      variant="ghost" 
                      title="Delete message" 
                      onClick={() => void remove(message.id)}
                      className="rounded hover:bg-[#f23f42] hover:text-white"
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