"use client";

import { Paperclip, Send, Smile, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUpload } from "@/components/ui/file-upload";

export const ChatInput = ({ channelId, onSent }: { channelId: string; onSent: () => void }) => {
  const [content, setContent] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim() && !fileUrl) return;
    setSending(true);
    try {
      const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId, content, fileUrl: fileUrl || undefined }) });
      if (!response.ok) throw new Error(await response.text());
      setContent(""); setFileUrl(""); setShowUpload(false); onSent();
    } finally { setSending(false); }
  };
  const emojis = ["😀", "😂", "😍", "🔥", "👍", "🎉", "❤️", "🚀", "😅", "🤔", "😭", "🙏", "✅", "❌", "👀", "💯"];
  return <div className="shrink-0 border-t border-[#111214] bg-[#1e1f22] px-4 pb-5 pt-3 sm:px-6">
    {showUpload && <div className="mx-auto mb-3 flex w-full max-w-5xl items-start gap-2"><div className="w-full max-w-sm"><FileUpload endpoint="MessageFile" value={fileUrl} onChange={(url) => setFileUrl(url ?? "")} /></div><Button type="button" size="icon" variant="ghost" className="text-[#b5bac1] hover:bg-[#35373c] hover:text-white" onClick={() => setShowUpload(false)}><X /></Button></div>}
    <form onSubmit={submit} className="mx-auto flex w-full max-w-5xl items-center gap-2"><Button type="button" size="icon" variant="ghost" className="text-[#b5bac1] hover:bg-[#35373c] hover:text-white" title="Attach a file" onClick={() => setShowUpload((value) => !value)}><Paperclip /></Button><div className="relative flex-1"><Input value={content} onChange={(event) => setContent(event.target.value)} placeholder="Message this channel" disabled={sending} className="h-11 rounded-xl border-0 bg-[#383a40] pr-12 text-[#dbdee1] shadow-none placeholder:text-[#949ba4] focus-visible:ring-1 focus-visible:ring-[#5865f2]" /><Button type="button" size="icon-xs" variant="ghost" title="Add emoji" className="absolute right-1 top-1/2 -translate-y-1/2 text-[#b5bac1] hover:bg-[#35373c] hover:text-white" onClick={() => setShowEmoji((value) => !value)}><Smile /></Button>{showEmoji && <div className="absolute bottom-12 right-0 z-20 grid w-64 grid-cols-8 gap-1 rounded-xl border border-[#1f2023] bg-[#111214] p-2 shadow-2xl">{emojis.map((emoji) => <button type="button" key={emoji} className="rounded p-1 text-lg transition hover:scale-125 hover:bg-[#35373c]" onClick={() => { setContent((value) => `${value}${emoji}`); setShowEmoji(false); }}>{emoji}</button>)}</div>}</div><Button type="submit" size="icon" className="h-11 w-11 rounded-xl bg-[#5865f2] text-white hover:bg-[#4752c4] [&_svg]:text-white" disabled={sending}><Send /></Button></form>
  </div>;
};
