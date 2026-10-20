import { redirect } from "next/navigation";
import { DirectMessages } from "@/components/direct/direct-messages";
import { currentProfile } from "@/lib/current-profile";

export default async function ConversationsPage() {
  const profile = await currentProfile();
  if (!profile) return redirect("/");
  return <div className="h-full bg-white dark:bg-[#1e1f22]"><DirectMessages profileId={profile.id} /></div>;
}
