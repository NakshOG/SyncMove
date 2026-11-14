"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ServerInfo = { id: string; name: string; imageURL: string };

export default function InvitePage() {
  const params = useParams<{ inviteCode: string }>() ?? { inviteCode: "" };
  const router = useRouter();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${params.inviteCode}`).then(async (response) => {
      if (!response.ok) { setError("This invite is invalid or expired."); return; }
      setServer(await response.json());
    });
  }, [params.inviteCode]);

  const join = async () => {
    setJoining(true);
    const response = await fetch(`/api/invites/${params.inviteCode}`, { method: "POST" });
    if (response.status === 401) { router.push(`/sign-in?redirect_url=/invite/${params.inviteCode}`); return; }
    if (!response.ok) { setError("Unable to join this server."); setJoining(false); return; }
    const data = await response.json();
    router.push(`/servers/${data.serverId}`);
  };

  return <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 dark:bg-zinc-900"><div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg dark:bg-zinc-800">{error ? <p className="text-rose-500">{error}</p> : server ? <><h1 className="text-2xl font-bold">Join {server.name}</h1><p className="mt-2 text-zinc-500">You have been invited to join this server.</p><Button className="mt-6 w-full" onClick={join} disabled={joining}>{joining ? "Joining…" : "Join server"}</Button></> : <p>Loading invite…</p>}</div></main>;
}
