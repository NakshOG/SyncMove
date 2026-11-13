"use client";

import { Paperclip, Send, Smile, X } from "lucide-react";
import { FormEvent, useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EncryptedFileUpload } from "./encrypted-file-upload";
import { useE2EEContext } from "@/components/providers/e2ee-provider";
import { E2EEIndicator } from "./e2ee-indicator";

export const ChatInput = ({
  channelId,
  onSent,
}: {
  channelId: string;
  onSent: () => void;
}) => {
  const [content, setContent] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);

  const { encryptForChannel, initialized } = useE2EEContext();
  const inputRef = useRef<HTMLInputElement>(null);

  const emojis = [
    "😀",
    "😂",
    "😍",
    "🔥",
    "👍",
    "🎉",
    "❤️",
    "🚀",
    "😅",
    "🤔",
    "😭",
    "🙏",
    "✅",
    "❌",
    "👀",
    "💯",
  ];

  const handleSend = useCallback(async () => {
    if (!content.trim()) return;
    setSending(true);

    try {
      let finalContent = content;
      let isEncrypted = false;

      if (initialized && content.trim()) {
        const encrypted = await encryptForChannel(channelId, content.trim());
        if (!encrypted) {
          throw new Error("Encrypted channel unavailable");
        }

        finalContent = encrypted;
        isEncrypted = encrypted.startsWith("{");
      }

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          content: finalContent,
          encrypted: isEncrypted,
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      setContent("");
      setShowUpload(false);
      onSent();
    } catch (error) {
      console.error("[ChatInput] Send error:", error);
    } finally {
      setSending(false);
    }
  }, [content, channelId, onSent, encryptForChannel, initialized]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await handleSend();
  };

  const insertEmoji = (emoji: string) => {
    setContent((value) => value + emoji);
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-white/5 bg-[#1e1f22] px-4 pb-5 pt-3">
      {showUpload && (
        <div className="mx-auto mb-3 flex w-full max-w-5xl items-start gap-2">
          <div className="w-full max-w-sm">
            <EncryptedFileUpload
              channelId={channelId}
              onUploadComplete={() => {
                setShowUpload(false);
                onSent();
              }}
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

      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-5xl items-center gap-2"
      >
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

        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={
              initialized
                ? "Message this channel (encrypted)"
                : "Message this channel"
            }
            disabled={sending}
            className="h-11 rounded-xl border-0 bg-[#383a40] pr-36 text-[#dbdee1] shadow-none placeholder:text-[#949ba4] focus-visible:ring-1 focus-visible:ring-[#5865f2] transition-colors"
          />

          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <E2EEIndicator initialized={initialized} />

            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              title="Add emoji"
              className="text-[#b5bac1] hover:bg-[#35373c] hover:text-white transition-colors"
              onClick={() => setShowEmoji((value) => !value)}
            >
              <Smile />
            </Button>

            {showEmoji && (
              <div className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-xl border border-[#1f2023] bg-[#111214] p-2 shadow-2xl">
                <div className="mb-2 flex flex-wrap gap-1">
                  {emojis.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      className="rounded-lg p-1.5 text-lg transition-all hover:scale-125 hover:bg-[#35373c]"
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 rounded-xl bg-[#5865f2] text-white hover:bg-[#4752c4] transition-colors [&_svg]:text-white"
          disabled={sending || !content.trim()}
        >
          <Send />
        </Button>
      </form>
    </div>
  );
};
