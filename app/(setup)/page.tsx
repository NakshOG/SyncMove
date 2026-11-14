import { db } from "@/lib/db";
import { initialProfile } from "@/lib/initial-profile";
import { redirect } from "next/navigation";

const SetupPage = async () => {
  const profile = await initialProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const server = await db.server.findFirst({
    where: {
      members: {
        some: {
          profileId: profile.id,
        },
      },
    },
    orderBy: {
      CreatedAt: "asc",
    },
    select: {
      id: true,
    },
  });

  if (server) {
    return redirect(`/servers/${server.id}`);
  }

  return redirect("/servers");
};

export default SetupPage;
