"use client";

import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface ChatEmptyStateProps {
  onSendMessage?: () => void;
}

export function ChatEmptyState({ onSendMessage }: ChatEmptyStateProps) {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No messages yet"
      description="Be the first to send a message in this channel!"
      action={onSendMessage ? { label: "Send Message", onClick: onSendMessage } : undefined}
    />
  );
}
