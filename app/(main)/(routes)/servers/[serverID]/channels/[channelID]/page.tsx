import { redirect } from "next/navigation";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatMessages } from "@/components/chat/chat-messages";
import { CallRoom } from "@/components/chat/call-room";
import { ChannelType } from "@/generated/prisma/browser";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";

const ChannelPage = async ({
  params,
}: {
  params: Promise<{ serverID: string; channelID: string }>;
}) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/");
  }

  const { serverID, channelID } = await params;
  const channel = await db.channel.findFirst({
    where: {
      id: channelID,
      serverId: serverID,
      server: {
        members: {
          some: {
            profileId: profile.id,
          },
        },
      },
    },
    include: {
      server: {
        include: {
          members: { include: { profile: true } },
        },
      },
    },
  });

  if (!channel) {
    return redirect("/");
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col bg-white dark:bg-[#1e1f22] md:h-[100dvh]">
      {channel.type === ChannelType.TEXT ? <><ChatHeader name={channel.name} type={channel.type} /><ChatMessages channelId={channel.id} profileId={profile.id} /></> : <CallRoom roomId={channel.id} video={channel.type === ChannelType.VIDEO} currentParticipant={{ id: profile.id, name: profile.name, imageUrl: profile.imageUrl }} participants={channel.server.members.map((member) => ({ id: member.profileId, name: member.profile.name, imageUrl: member.profile.imageUrl }))} />}
    </div>
  );
};

export default ChannelPage;
