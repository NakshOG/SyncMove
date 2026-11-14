"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useModal } from "@/hooks/use-modal-store";
import { Button } from "@/components/ui/button";

export const ChannelSectionHeader = ({ title, serverId, canManage }: { title: string; serverId: string; canManage: boolean }) => {
  const { onOpen } = useModal();
  return <div className="group flex items-center px-1 text-[11px] font-bold uppercase tracking-wide text-[#949ba4]"><ChevronDown className="mr-0.5 h-3 w-3" /><span className="flex-1">{title}</span>{canManage && <Button type="button" size="icon-xs" variant="ghost" className="h-5 w-5 text-[#949ba4] hover:text-white" title={`Create ${title.toLowerCase()}`} onClick={() => onOpen("createChannel", { serverId })}><Plus /></Button>}</div>;
};
