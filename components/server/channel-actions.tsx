"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export const ChannelActions = ({ channelId, channelName }: { channelId: string; channelName: string }) => {
  const router = useRouter();
  const edit = async () => { const name = window.prompt("Channel name", channelName)?.trim(); if (!name || name === channelName) return; const response = await fetch(`/api/channels/${channelId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); if (response.ok) router.refresh(); };
  const remove = async () => { if (!window.confirm(`Delete #${channelName}?`)) return; const response = await fetch(`/api/channels/${channelId}`, { method: "DELETE" }); if (response.ok) router.refresh(); else window.alert(await response.text()); };
  return <div className="hidden items-center gap-0.5 group-hover:flex"><Button size="icon-xs" variant="ghost" onClick={edit} title="Edit channel"><Pencil /></Button><Button size="icon-xs" variant="ghost" onClick={remove} title="Delete channel"><Trash2 /></Button></div>;
};
