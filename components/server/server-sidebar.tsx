import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ChannelType } from "@/generated/prisma/browser";
import { Channel } from "@/generated/prisma/client";
import { ScrollArea } from "@/components/ui/scroll-area";
interface ServerSidebarProps {
  serverId: string;
}
import { ServerHeader } from "./server-header";
import Link from "next/link";
import { Hash, Volume2, Video } from "lucide-react";
import { MemberRole } from "@/generated/prisma/enums";
import { MemberList } from "./member-list";
import { ChannelActions } from "./channel-actions";
import { ChannelSectionHeader } from "./channel-section-header";
import { UserControls } from "./user-controls";

export const ServerSidebar = async ({ serverId }: ServerSidebarProps) => {
  const profile = await currentProfile();
  if (!profile) {
    return redirect("/");
  }
  const server = await db.server.findUnique({
    where: {
      id: serverId,
    },
    include: {
      channels: {
        orderBy: {
          CreatedAt: "asc",
        },
      },
      members: {
        include: {
          profile: true,
        },
        orderBy: {
          role: "asc",
        },
      },
    },
  });

  const textChannels = server?.channels.filter(
    (channel) => channel.type === ChannelType.TEXT,
  );

  const voiceChannels = server?.channels.filter(
    (channel) => channel.type === ChannelType.AUDIO,
  );

  const videoChannels = server?.channels.filter(
    (channel) => channel.type === ChannelType.VIDEO,
  );
  if (!server) {
    return redirect("/");
  }

  const currentMember = server.members.find((member) => member.profileId === profile.id);

  return (
    <div className="flex h-full w-full flex-col bg-[#2b2d31] text-[#b5bac1]">
      <ServerHeader server={server} role={server.members.find((member) => member.profileId === profile.id)?.role} />
      <ScrollArea className="min-h-0 flex-1 bg-[#2b2d31] px-2 py-3">
        <ChannelSection title="Text Channels" channels={textChannels} serverId={server.id} canManage={server.members.find((member) => member.profileId === profile.id)?.role !== MemberRole.GUEST} />
        <ChannelSection title="Voice Channels" channels={voiceChannels} serverId={server.id} canManage={server.members.find((member) => member.profileId === profile.id)?.role !== MemberRole.GUEST} />
        <ChannelSection title="Video Channels" channels={videoChannels} serverId={server.id} canManage={server.members.find((member) => member.profileId === profile.id)?.role !== MemberRole.GUEST} />
        <MemberList
          serverId={server.id}
          members={server.members}
          currentProfileId={profile.id}
          currentRole={server.members.find((member) => member.profileId === profile.id)?.role ?? MemberRole.GUEST}
        />
      </ScrollArea>
      <UserControls imageUrl={profile.imageUrl} name={profile.name} status={currentMember?.role === MemberRole.ADMIN ? "Server owner" : "Online"} />
    </div>
  );
};

const ChannelSection = ({
  title,
  channels,
  serverId,
  canManage,
}: {
  title: string;
  channels: Channel[] | undefined;
  serverId: string;
  canManage: boolean;
}) => {
  if (!channels?.length) return null;

  return (
    <div className="mb-5">
      <ChannelSectionHeader title={title} serverId={serverId} canManage={canManage} />
      <div className="mt-1 space-y-0.5">
        {channels.map((channel) => {
          const Icon = channel.type === ChannelType.TEXT
            ? Hash
            : channel.type === ChannelType.AUDIO
              ? Volume2
              : Video;

          return (
            <div key={channel.id} className="group flex items-center rounded-md text-[#949ba4] transition hover:bg-[#35373c] hover:text-[#dbdee1]">
            <Link
              key={channel.id}
              href={`/servers/${serverId}/channels/${channel.id}`}
              className="flex min-w-0 flex-1 items-center gap-x-2 px-2 py-1.5 text-sm transition"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{channel.name}</span>
            </Link>
            {canManage && <ChannelActions channelId={channel.id} channelName={channel.name} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};
