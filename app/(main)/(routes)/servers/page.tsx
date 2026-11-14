import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ServerHub } from "@/components/server/server-hub";

export default async function ServersIndexPage() {
  const profile = await currentProfile();
  if (!profile) return redirect("/");

  const servers = await db.server.findMany({
    where: { members: { some: { profileId: profile.id } } },
    orderBy: { CreatedAt: "asc" },
    select: { id: true, name: true, imageURL: true },
  });

  return <ServerHub servers={servers} profileName={profile.name} />;
}
