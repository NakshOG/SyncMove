"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { MemberRole } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

type MemberItem = { id: string; role: MemberRole; profileId: string; profile: { name: string; imageUrl: string } };

export const MemberList = ({ serverId, members, currentRole, currentProfileId }: { serverId: string; members: MemberItem[]; currentRole: MemberRole; currentProfileId: string }) => {
  const [items, setItems] = useState(members);
  const router = useRouter();
  const canManage = currentRole === MemberRole.ADMIN || currentRole === MemberRole.MODERATOR;
  const updateRole = async (memberId: string, role: MemberRole) => {
    const response = await fetch(`/api/servers/${serverId}/members/${memberId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    if (response.ok) setItems((current) => current.map((member) => member.id === memberId ? { ...member, role } : member));
  };
  const kick = async (memberId: string) => {
    const response = await fetch(`/api/servers/${serverId}/members/${memberId}`, { method: "DELETE" });
    if (response.ok) setItems((current) => current.filter((member) => member.id !== memberId));
  };
  const startConversation = async (memberId: string) => { const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId }) }); if (response.ok) { const conversation = await response.json(); router.push(`/conversations?conversationId=${conversation.id}`); } };
  return <div className="border-t border-zinc-300/60 px-2 py-3 dark:border-zinc-700/60"><p className="px-2 text-xs font-semibold uppercase text-zinc-500">Members</p><div className="mt-2 space-y-1">{items.map((member) => <div key={member.id} className="group flex items-center gap-2 rounded px-2 py-1 text-sm"><span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{member.profile.name}</span><span className="text-[10px] uppercase text-zinc-500">{member.role}</span>{member.profileId !== currentProfileId && <Button size="icon-xs" variant="ghost" title="Message member" onClick={() => void startConversation(member.id)}><MessageCircle /></Button>}{canManage && member.role !== MemberRole.ADMIN && <div className="hidden gap-1 group-hover:flex"><Button size="icon-xs" variant="ghost" title="Make moderator" onClick={() => updateRole(member.id, member.role === MemberRole.MODERATOR ? MemberRole.GUEST : MemberRole.MODERATOR)}>M</Button><Button size="icon-xs" variant="ghost" title="Kick member" onClick={() => kick(member.id)}>×</Button></div>}</div>)}</div></div>;
};
