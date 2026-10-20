"use client";

import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MemberRole } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/components/providers/socket-provider";

type MemberItem = {
  id: string;
  role: MemberRole;
  profileId: string;
  profile: { name: string; imageUrl: string };
};

export const MemberList = ({
  serverId,
  members,
  currentRole,
  currentProfileId,
}: {
  serverId: string;
  members: MemberItem[];
  currentRole: MemberRole;
  currentProfileId: string;
}) => {
  const router = useRouter();
  const { socket } = useSocket();
  const [onlineProfiles, setOnlineProfiles] = useState<string[]>([currentProfileId]);
  const canManage = currentRole === MemberRole.ADMIN || currentRole === MemberRole.MODERATOR;

  useEffect(() => {
    if (!socket) return;
    const refreshMembers = () => router.refresh();
    const receivePresence = (profileIds: string[]) => setOnlineProfiles(profileIds);
    socket.on("server-members-event", refreshMembers);
    socket.on("server-presence", receivePresence);
    socket.emit("join-server", { serverId, profileId: currentProfileId });
    return () => {
      socket.emit("leave-server", serverId);
      socket.off("server-members-event", refreshMembers);
      socket.off("server-presence", receivePresence);
    };
  }, [currentProfileId, router, serverId, socket]);

  const updateRole = async (memberId: string, role: MemberRole) => {
    const response = await fetch(`/api/servers/${serverId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (response.ok) router.refresh();
  };

  const kick = async (memberId: string) => {
    const response = await fetch(`/api/servers/${serverId}/members/${memberId}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  };

  const startConversation = async (memberId: string) => {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    if (response.ok) {
      const conversation = await response.json() as { id: string };
      router.push(`/conversations?conversationId=${conversation.id}`);
    }
  };

  return (
    <div className="border-t border-[#1f2023] px-1 py-4">
      <p className="px-2 text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">Members — {members.length}</p>
      <div className="mt-2 space-y-0.5">
        {members.map((member) => (
          <div key={member.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-[#35373c]">
            <div className="relative shrink-0">
              <Image src={member.profile.imageUrl} alt={member.profile.name} width={32} height={32} unoptimized className="h-8 w-8 rounded-full" />
              <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#2b2d31] ${onlineProfiles.includes(member.profileId) ? "bg-[#23a559]" : "bg-[#747f8d]"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[#dbdee1]">{member.profile.name}{member.profileId === currentProfileId && <span className="ml-1 text-xs text-[#949ba4]">(you)</span>}</p>
              <p className="text-[10px] capitalize text-[#949ba4]">{member.role.toLowerCase()}</p>
            </div>
            {member.profileId !== currentProfileId && <Button size="icon-xs" variant="ghost" className="hidden text-[#b5bac1] group-hover:inline-flex hover:text-white" title="Message member" onClick={() => void startConversation(member.id)}><MessageCircle /></Button>}
            {canManage && member.role !== MemberRole.ADMIN && <div className="hidden gap-1 group-hover:flex"><Button size="icon-xs" variant="ghost" title="Make moderator" onClick={() => void updateRole(member.id, member.role === MemberRole.MODERATOR ? MemberRole.GUEST : MemberRole.MODERATOR)}>M</Button><Button size="icon-xs" variant="ghost" title="Kick member" onClick={() => void kick(member.id)}>×</Button></div>}
          </div>
        ))}
      </div>
    </div>
  );
};
