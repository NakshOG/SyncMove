"use client";

import { Compass } from "lucide-react";
import { useModal } from "@/hooks/use-modal-store";
import { ActionTooltip } from "../action-tooltip";

export const DiscoverAction = () => {
  const { onOpen } = useModal();
  
  return (
    <ActionTooltip label="Join a server" side="right" align="center">
      <button 
        type="button" 
        aria-label="Join a server" 
        onClick={() => onOpen("joinServer")} 
        className="group flex h-12 w-12 items-center justify-center rounded-xl bg-[#313338] text-[#b5bac1] transition-all hover:bg-[#5865f2] hover:text-white"
      >
        <Compass className="h-5 w-5" />
      </button>
    </ActionTooltip>
  );
};