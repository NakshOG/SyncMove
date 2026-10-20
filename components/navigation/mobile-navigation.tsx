import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NavigationAction } from "./navigation-action";
import { DiscoverAction } from "./discover-action";
import { ActionTooltip } from "../action-tooltip";

export const MobileNavigation = async () => {
  const profile = await currentProfile();
  if (!profile) return null;
  const servers = await db.server.findMany({ where: { members: { some: { profileId: profile.id } } }, orderBy: { CreatedAt: "asc" } });
  return <div className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center gap-2 overflow-x-auto border-t border-zinc-200 bg-[#f2f3f5]/95 px-3 backdrop-blur dark:border-zinc-700 dark:bg-[#1e1f22]/95 md:hidden"><ActionTooltip label="Direct messages" side="top" align="center"><Link href="/conversations" aria-label="Direct messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"><MessageCircle className="h-5 w-5" /></Link></ActionTooltip><NavigationAction /><DiscoverAction />{servers.map((server) => <Link key={server.id} href={`/servers/${server.id}`} title={server.name} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl"><Image fill src={server.imageURL} alt={server.name} className="object-cover" /></Link>)}</div>;
};
