import { currentProfile } from "@/lib/current-profile";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

import { NavigationAction } from "./navigation-action";
import { Separator } from "../ui/separator";
import { ScrollArea } from "../ui/scroll-area";
import { NavigationItem } from "./navigation-item";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { DiscoverAction } from "./discover-action";
import { ActionTooltip } from "../action-tooltip";

export const NavigationSidebar = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/");
  }

  const servers = await db.server.findMany({
    where: {
      members: {
        some: {
          profileId: profile.id,
        },
      },
    },
  });

  return (
    <div className="flex h-full w-full flex-col items-center gap-3 bg-[#1e1f22] py-3 text-[#b5bac1]">
      <NavigationAction />

      <ActionTooltip label="Direct messages" side="right" align="center">
        <Link href="/conversations" aria-label="Direct messages" className="group relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#313338] text-[#b5bac1] transition-all hover:rounded-xl hover:bg-[#5865f2] hover:text-white">
          <MessageCircle className="h-5 w-5" />
        </Link>
      </ActionTooltip>
      <DiscoverAction />

      <Separator className="mx-auto h-px !w-3/4 bg-[#35373c]" />

      <ScrollArea className="w-full flex-1">
        {servers.map((server) => (
          <div key={server.id} className="mb-3">
            <NavigationItem
              id={server.id}
              imageUrl={server.imageURL || ""}
              name={server.name}
            />
          </div>
        ))}
      </ScrollArea>

      <div className="mt-auto pb-2" />
    </div>
  );
};
