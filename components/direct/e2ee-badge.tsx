"use client";

import { Lock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface E2EEBadgeProps {
  className?: string;
}

export function E2EEBadge({ className }: E2EEBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-full bg-[#23a559]/10 px-2 py-0.5",
                className,
              )}
            >
              <Lock className="h-3 w-3 text-[#23a559]" />
              <span className="text-xs font-medium text-[#23a559]">
                Encrypted
              </span>
            </button>
          }
        />
        <TooltipContent>
          <p>Messages are end-to-end encrypted</p>
          <p className="text-[#949ba4]">
            Only participants can read these messages
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
