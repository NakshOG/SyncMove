"use client";

import { Paperclip, Send, Smile, X } from "lucide-react";
import { FormEvent, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUpload } from "@/components/ui/file-upload";
import { useE2EEContext } from "@/components/providers/e2ee-provider";

export const ChatInput = ({ channelId, onSent }: { channelId: string; onSent: () => void }) => {
  const [content, setContent] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  
  const { encryptForChannel, initialized } = useE2EEContext();

  const handleSend = useCallback(async () => {
    if (!content.trim() && !fileUrl) return;
    setSending(true);

    try {
      // Encrypt message content if E2EE is initialized
      let finalContent = content;
      
      if (initialized && content.trim()) {
        const encrypted = await encryptForChannel(channelId, content.trim());
        if (encrypted && encrypted.startsWith("{")) {
          finalContent = encrypted; // Send encrypted content
        }
      }

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          channelId, 
          content: finalContent,
          fileUrl: fileUrl || undefined,
          encrypted: initialized && content.trim() ? true : false,
        }),
      });

      if (!response.ok) throw new Error(await response.text());
      
      setContent("");
      setFileUrl("");
      setShowUpload(false);
      onSent();
    } catch (error) {
      console.error("[ChatInput] Send error:", error);
    } finally {
      setSending(false);
    }
  }, [content, fileUrl, channelId, onSent, encryptForChannel, initialized]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await handleSend();
  };

  const emojis = ["😀", "😂", "😍", "🔥", "👍", "🎉", "❤️", "🚀", "😅", "🤔", "😭", "🙏", "✅", "❌", "👀", "💯"];

  return (
    <div className="shrink-0 border-t border-white/5 bg-[#1e1f22] px-4 pb-5 pt-3">
      {/* File upload area */}
      {showUpload && (
        <div className="mx-auto mb-3 flex w-full max-w-5xl items-start gap-2">
          <div className="w-full max-w-sm">
            <FileUpload 
              endpoint="MessageFile" 
              value={fileUrl} 
              onChange={(url) => setFileUrl(url ?? "")} 
            />
          </div>
          <Button 
            type="button" 
            size="icon" 
            variant="ghost" 
            className="text-[#b5bac1] hover:bg-[#35373c] hover:text-white transition-colors" 
            onClick={() => setShowUpload(false)}
          >
            <X />
          </Button>
        </div>
      )}
      
      <form onSubmit={submit} className="mx-auto flex w-full max-w-5xl items-center gap-2">
        {/* Attach button */}
        <Button 
          type="button" 
          size="icon" 
          variant="ghost" 
          className="text-[#b5bac1] hover:bg-[#35373c] hover:text-white transition-colors" 
          title="Attach a file" 
          onClick={() => setShowUpload((value) => !value)}
        >
          <Paperclip />
        </Button>
        
        {/* Message input */}
        <div className="relative flex-1">
          <Input 
            value={content} 
            onChange={(event) => setContent(event.target.value)} 
            placeholder={initialized ? "Message this channel (encrypted)" : "Message this channel"} 
            disabled={sending} 
            className="h-11 rounded-xl border-0 bg-[#383a40] pr-12 text-[#dbdee1] shadow-none placeholder:text-[#949ba4] focus-visible:ring-1 focus-visible:ring-[#5865f2] transition-colors" 
          />
          
          {/* Emoji button */}
          <Button 
            type="button" 
            size="icon-xs" 
            variant="ghost" 
            title="Add emoji" 
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[#b5bac1] hover:bg-[#35373c] hover:text-white transition-colors" 
            onClick={() => setShowEmoji((value) => !value)}
          >
            <Smile />
          </Button>
          
          {/* Emoji picker */}
          {showEmoji && (
            <div className="absolute bottom-full right-0 z-50 mb-2 grid w-64 grid-cols-8 gap-1 rounded-xl border border-[#1f2023] bg-[#111214] p-2 shadow-2xl">
              {emojis.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  className="rounded-lg p-2 text-lg transition-all hover:scale-125 hover:bg-[#35373c] hover:shadow-sm"
                  onClick={() => {
                    setContent((value) => `${value}${emoji}`);
                    setShowEmoji(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Send button */}
        <Button 
          type="submit" 
          size="icon" 
          className="h-11 w-11 rounded-xl bg-[#5865f2] text-white hover:bg-[#4752c4] transition-colors [&_svg]:text-white"
          disabled={sending || (!content.trim() && !fileUrl)}
        >
          <Send />
        </Button>
      </form>
    </div>
  );
};