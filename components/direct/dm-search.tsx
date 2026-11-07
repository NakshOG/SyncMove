"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DMSearchProps {
  conversations: Array<{ id: string; [key: string]: unknown }>;
  onFilter: (filtered: typeof conversations) => void;
}

const RECENT_EMOJIS = ["??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "?", "?", "??", "??"];

export function DMSearch({ conversations, onFilter }: DMSearchProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const lower = query.toLowerCase();
    return conversations.filter(c => {
      // Filter by conversation id or any string property
      return c.id.toLowerCase().includes(lower);
    });
  }, [conversations, query]);

  useMemo(() => {
    onFilter(filtered);
  }, [filtered, onFilter]);

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
