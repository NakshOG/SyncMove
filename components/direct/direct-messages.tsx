"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useSocket } from "@/components/providers/socket-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Search, Video } from "lucide-react";

type Conversation = { id: string; memberOne: { profile: { id: string; name: string; imageUrl: string } }; memberTwo: { profile: { id: string; name: string; imageUrl: string } } };
type DirectMessage = { id: string; content: string; CreatedAt: string; member: { profile: { name: string; imageUrl: string } } };

export const DirectMessages = ({ profileId }: { profileId: string }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string>();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [content, setContent] = useState("");
  const { socket, isConnected } = useSocket();
  const searchParams = useSearchParams();

  useEffect(() => { fetch("/api/conversations").then((response) => response.json()).then((items: Conversation[]) => { setConversations(items); setSelected(searchParams?.get("conversationId") ?? items[0]?.id); }); }, [searchParams]);
  useEffect(() => {
    if (!selected) return;
    const load = () => fetch(`/api/conversations/${selected}/messages`, { cache: "no-store" }).then((response) => response.json()).then(setMessages);
    void load();
    if (!socket || !isConnected) { const timer = window.setInterval(() => void load(), 3000); return () => window.clearInterval(timer); }
    const receive = (event: { type: "created"; message: DirectMessage }) => { if (event.type === "created") setMessages((current) => current.some((item) => item.id === event.message.id) ? current : [...current, event.message]); };
    socket.emit("join-conversation", selected);
    socket.on("conversation-event", receive);
    return () => { socket.emit("leave-conversation", selected); socket.off("conversation-event", receive); };
  }, [isConnected, selected, socket]);
  const send = async () => {
    if (!selected || !content.trim()) return;
    await fetch(`/api/conversations/${selected}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    setContent("");
    const response = await fetch(`/api/conversations/${selected}/messages`);
    setMessages(await response.json());
  };
  const selectedConversation = conversations.find((conversation) => conversation.id === selected);
  const selectedProfile = selectedConversation ? (selectedConversation.memberOne.profile.id === profileId ? selectedConversation.memberTwo.profile : selectedConversation.memberOne.profile) : undefined;
  const selectedName = selectedProfile?.name ?? "Direct messages";

  return (
    <div className="flex h-full min-h-0 bg-[#1e1f22] text-[#dbdee1]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[#1f2023] bg-[#2b2d31] p-3">
        <div className="mb-4">
          <h1 className="text-sm font-bold text-white">Direct messages</h1>
        </div>
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#949ba4]" />
          <Input placeholder="Find a conversation" className="h-9 border-0 bg-[#1e1f22] pl-8 text-xs text-white placeholder:text-[#949ba4]" />
        </div>
        <div className="space-y-1">
          {conversations.map((conversation) => {
            const other = conversation.memberOne.profile.id === profileId ? conversation.memberTwo.profile : conversation.memberOne.profile;
            return (
              <button key={conversation.id} className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition ${selected === conversation.id ? "bg-[#404249] text-white" : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]"}`} onClick={() => setSelected(conversation.id)}>
                <Image src={other.imageUrl} alt={other.name} width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-full object-cover" />
                <span className="truncate">{other.name}</span>
              </button>
            );
          })}
          {!conversations.length && <p className="px-2 text-sm text-[#949ba4]">Start a conversation from a server member.</p>}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#1f2023] bg-[#1e1f22] px-5">
          {selectedProfile ? <Image src={selectedProfile.imageUrl} alt={selectedProfile.name} width={32} height={32} unoptimized className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2]"><MessageCircle className="h-4 w-4 text-white" /></span>}
          <div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-white">{selectedName}</h2><p className="text-xs text-[#949ba4]">Private conversation</p></div>
          <button title="Start video call" className="rounded p-2 text-[#b5bac1] hover:bg-[#35373c] hover:text-white"><Video className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#1e1f22] p-5">
          {messages.map((message) => <div key={message.id} className="flex gap-3"><Image src={message.member.profile.imageUrl} alt={message.member.profile.name} width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-full object-cover" /><div><div className="flex items-baseline gap-2"><b className="text-sm text-white">{message.member.profile.name}</b><time className="text-[11px] text-[#949ba4]">{new Date(message.CreatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p className="text-sm text-[#dbdee1]">{message.content}</p></div></div>)}
        </div>
        {selected && <form className="flex shrink-0 gap-2 border-t border-[#1f2023] bg-[#1e1f22] p-4" onSubmit={(event) => { event.preventDefault(); void send(); }}><Input value={content} onChange={(event) => setContent(event.target.value)} placeholder={`Message ${selectedName}`} className="h-11 rounded-xl border-0 bg-[#383a40] text-white placeholder:text-[#949ba4]" /><Button type="submit" className="h-11 rounded-xl bg-[#5865f2] hover:bg-[#4752c4]">Send</Button></form>}
      </main>
    </div>
  );
};
