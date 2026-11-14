"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Conversation = { id: string; [key: string]: unknown };

interface DMSearchProps {
  conversations: Conversation[];
  profileId: string;
  onFilter: (filtered: Conversation[]) => void;
}

export function DMSearch({ conversations, profileId, onFilter }: DMSearchProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const lower = query.trim().toLocaleLowerCase();
    if (!lower) {
      onFilter(conversations);
      return;
    }
    onFilter(
      conversations.filter((conversation) => {
        const one = conversation.memberOne as { profile?: { name?: string } } | undefined;
        const two = conversation.memberTwo as { profile?: { name?: string } } | undefined;
        const otherName = one?.profile?.id === profileId
          ? two?.profile?.name
          : one?.profile?.name;
        return Boolean(otherName?.toLocaleLowerCase().includes(lower));
      }),
    );
  }, [conversations, onFilter, profileId, query]);

  return (
    <div className="relative mb-4">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#949ba4]" />
      <Input
        placeholder="Find a conversation"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9 border-0 bg-[#1e1f22] pl-8 pr-8 text-xs text-white placeholder:text-[#949ba4] focus-visible:ring-1 focus-visible:ring-[#5865f2]"
      />
      {query && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute right-1 top-1 text-[#949ba4] hover:text-white"
          onClick={() => setQuery("")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
