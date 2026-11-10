"use client";

import { Lock, Unlock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface E2EEIndicatorProps {
  initialized: boolean;
  className?: string;
}

export function E2EEIndicator({ initialized, className }: E2EEIndicatorProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn("flex items-center gap-1.5 text-xs", className)}
            >
              {initialized ? (
                <>
                  <Lock className="h-3.5 w-3.5 text-[#23a559]" />
                  <span className="text-[#23a559]">Encrypted</span>
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 text-[#f0b232]" />
                  <span className="text-[#f0b232]">Not encrypted</span>
                </>
              )}
            </button>
          }
        />
        <TooltipContent>
          {initialized
            ? "Messages are end-to-end encrypted"
            : "Messages are not encrypted yet"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
