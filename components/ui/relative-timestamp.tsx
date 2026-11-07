"use client";

import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RelativeTimestampProps {
  date: string | Date;
  className?: string;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return ${minutes}m ago;
  if (hours < 24) return ${hours}h ago;
  if (days < 7) return ${days}d ago;
  
  return date.toLocaleDateString([], { 
    month: "short", 
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined
  });
}

export function RelativeTimestamp({ date, className }: RelativeTimestampProps) {
  const [relative, setRelative] = useState(() => formatRelativeTime(new Date(date)));

  useEffect(() => {
    const update = () => setRelative(formatRelativeTime(new Date(date)));
    const interval = setInterval(update, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [date]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <time className={cn("text-[11px] text-[#949ba4] cursor-help", className)}>
            {relative}
          </time>
        </TooltipTrigger>
        <TooltipContent>
          {new Date(date).toLocaleString()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
