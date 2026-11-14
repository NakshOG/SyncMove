import { redirect } from "next/navigation";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ChannelType } from "@/generated/prisma/browser";

const ServerPage = async ({
  params,
}: {
  params: Promise<{ serverID: string }>;
}) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/");
  }

  const { serverID } = await params;
  const server = await db.server.findUnique({
    where: {
      id: serverID,
      members: {
        some: {
          profileId: profile.id,
        },
      },
    },
    include: {
      channels: {
        orderBy: {
          CreatedAt: "asc",
        },
      },
    },
  });

  if (!server) {
    return redirect("/");
  }

  const initialChannel = server.channels.find(
    (channel) => channel.type === ChannelType.TEXT,
  );

  if (initialChannel) {
    return redirect(`/servers/${serverID}/channels/${initialChannel.id}`);
  }

  return (
    <div className="flex h-full items-center justify-center bg-white text-center dark:bg-[#313338]">
      <div>
        <h1 className="text-xl font-semibold text-zinc-800 dark:text-white">
          {server.name}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          This server does not have a text channel yet.
        </p>
      </div>
    </div>
  );
};

export default ServerPage;
