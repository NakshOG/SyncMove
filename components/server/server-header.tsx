"use client"
import { ServerWithMembersWithProfile } from "@/types"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Copy, LogOut, Plus, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { MemberRole } from "@/generated/prisma/enums";
import { useModal } from "@/hooks/use-modal-store";
import { useRouter } from "next/navigation";
interface ServerHeaderProps {
  server: ServerWithMembersWithProfile;
  role?: MemberRole;
}

export const ServerHeader = ({ server, role }: ServerHeaderProps) => {
  const [copied, setCopied] = useState(false);
  const { onOpen } = useModal();
  const router = useRouter();
  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${server.inviteCode}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const leave = async () => { if (!window.confirm("Leave this server?")) return; await fetch(`/api/servers/${server.id}/leave`, { method: "POST" }); router.push("/"); router.refresh(); };
  const remove = async () => { if (!window.confirm("Delete this server permanently?")) return; await fetch(`/api/servers/${server.id}`, { method: "DELETE" }); router.push("/"); router.refresh(); };

return (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <button className="flex h-12 w-full items-center gap-2 border-b border-[#1f2023] bg-[#2b2d31] px-4 text-left text-sm font-semibold text-white transition hover:bg-[#35373c]">
        <span className="min-w-0 flex-1 truncate">{server.name}</span>
        <ChevronDown className="h-4 w-4 text-[#b5bac1]" />
        </button>
      }
    />
    <DropdownMenuContent className="w-64">
      <DropdownMenuItem onClick={copyInvite} className="cursor-pointer">
        {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
        {copied ? "Invite copied" : "Copy invite link"}
      </DropdownMenuItem>
      {(role === MemberRole.ADMIN || role === MemberRole.MODERATOR) && <DropdownMenuItem onClick={() => onOpen("createChannel", { serverId: server.id })} className="cursor-pointer"><Plus className="mr-2 h-4 w-4" />Create channel</DropdownMenuItem>}
      {role === MemberRole.ADMIN && <DropdownMenuItem onClick={() => onOpen("serverSettings", { serverId: server.id, serverName: server.name, serverImageURL: server.imageURL })} className="cursor-pointer"><Settings className="mr-2 h-4 w-4" />Server settings</DropdownMenuItem>}
      <DropdownMenuSeparator />
      {role === MemberRole.ADMIN ? <DropdownMenuItem onClick={remove} variant="destructive" className="cursor-pointer"><Trash2 className="mr-2 h-4 w-4" />Delete server</DropdownMenuItem> : <DropdownMenuItem onClick={leave} variant="destructive" className="cursor-pointer"><LogOut className="mr-2 h-4 w-4" />Leave server</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>
);


} 
