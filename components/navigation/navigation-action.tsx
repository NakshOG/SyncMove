"use client";

import { Plus } from "lucide-react";
import { ActionTooltip } from "../action-tooltip";
import { useModal } from "@/hooks/use-modal-store";

export const NavigationAction = () => {
  const { onOpen } = useModal();

  return (
    <ActionTooltip label="Add a Server" side="right" align="center">
      <button
        type="button"
        aria-label="Add a server"
        onClick={() => onOpen("createServer")}
        className="group mx-3 flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-[#313338] transition-all hover:bg-[#5865f2]"
      >
        <Plus className="text-[#b5bac1] transition group-hover:text-white" size={25} />
      </button>
    </ActionTooltip>
  );
};