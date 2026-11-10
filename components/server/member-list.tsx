"use client";

import Image from "next/image";
import { MessageCircle, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MemberRole } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/components/providers/socket-provider";
import { MemberRoleBadge } from "@/components/members/member-role-badge";
import { MemberListSkeleton } from "@/components/members/member-list-skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [onlineProfiles, setOnlineProfiles] = useState<string[]>([
    currentProfileId,
  ]);
  const [loading, setLoading] = useState(true);
  const canManage =
    currentRole === MemberRole.ADMIN || currentRole === MemberRole.MODERATOR;

  useEffect(() => {
    if (!socket) return;
    const refreshMembers = () => router.refresh();
    const receivePresence = (profileIds: string[]) =>
      setOnlineProfiles(profileIds);
    socket.on("server-members-event", refreshMembers);
    socket.on("server-presence", receivePresence);
    socket.emit("join-server", { serverId, profileId: currentProfileId });

    const timer = setTimeout(() => setLoading(false), 500);

    return () => {
      socket.emit("leave-server", serverId);
      socket.off("server-members-event", refreshMembers);
      socket.off("server-presence", receivePresence);
      clearTimeout(timer);
    };
  }, [currentProfileId, router, serverId, socket]);

  const updateRole = async (memberId: string, role: MemberRole) => {
    const response = await fetch(
      `/api/servers/${serverId}/members/${memberId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      },
    );
    if (response.ok) router.refresh();
  };

  const kick = async (memberId: string) => {
    const response = await fetch(
      `/api/servers/${serverId}/members/${memberId}`,
      { method: "DELETE" },
    );
    if (response.ok) router.refresh();
  };

  const startConversation = async (memberId: string) => {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    if (response.ok) {
      const conversation = (await response.json()) as { id: string };
      router.push(`/conversations?conversationId=${conversation.id}`);
    }
  };

  if (loading) {
    return <MemberListSkeleton />;
  }

  return (
    <div className="border-t border-[#1f2023] px-1 py-4">
      <div className="mb-3 flex items-center justify-between px-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">
          Members - {members.length}
        </p>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="inline-flex size-6 items-center justify-center rounded-md text-[#b5bac1] transition hover:bg-[#35373c] hover:text-white"
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              }
            />
            <DropdownMenuContent
              align="end"
              className="bg-[#2b2d31] border-[#1f2023]"
            >
              <DropdownMenuItem className="text-[#dbdee1] focus:bg-[#35373c]">
                Invite via link
              </DropdownMenuItem>
              <DropdownMenuItem className="text-[#dbdee1] focus:bg-[#35373c]">
                Invite via email
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="space-y-0.5">
        {members.map((member) => (
          <div
            key={member.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-[#35373c]"
          >
            <div className="relative shrink-0">
              <Image
                src={member.profile.imageUrl}
                alt={member.profile.name}
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 rounded-full"
              />
              <span
                className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#2b2d31] ${
                  onlineProfiles.includes(member.profileId)
                    ? "bg-[#23a559]"
                    : "bg-[#6b7280]"
                }`}
                title={
                  onlineProfiles.includes(member.profileId)
                    ? "Online"
                    : "Offline"
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[#dbdee1]">
                {member.profile.name}
                {member.profileId === currentProfileId && (
                  <span className="ml-1 text-xs text-[#949ba4]">(you)</span>
                )}
              </p>
              <MemberRoleBadge role={member.role} />
            </div>
            {member.profileId !== currentProfileId && (
              <Button
                size="icon-xs"
                variant="ghost"
                className="hidden text-[#b5bac1] group-hover:inline-flex hover:text-white transition-colors"
                title="Message member"
                onClick={() => void startConversation(member.id)}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            )}
            {canManage && member.role !== MemberRole.ADMIN && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="hidden size-6 items-center justify-center rounded-md text-[#b5bac1] transition group-hover:inline-flex hover:bg-[#35373c] hover:text-white"
                    >
                      <span className="text-sm">...</span>
                    </button>
                  }
                />
                <DropdownMenuContent
                  align="end"
                  className="bg-[#2b2d31] border-[#1f2023]"
                >
                  <DropdownMenuItem
                    className="text-[#dbdee1] focus:bg-[#35373c]"
                    onClick={() =>
                      void updateRole(
                        member.id,
                        member.role === MemberRole.MODERATOR
                          ? MemberRole.GUEST
                          : MemberRole.MODERATOR,
                      )
                    }
                  >
                    {member.role === MemberRole.MODERATOR
                      ? "Remove moderator"
                      : "Make moderator"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-[#1f2023]" />
                  <DropdownMenuItem
                    className="text-[#f23f42] focus:bg-[#35373c]"
                    onClick={() => void kick(member.id)}
                  >
                    Remove member
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
