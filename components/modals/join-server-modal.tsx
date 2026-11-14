"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { useModal } from "@/hooks/use-modal-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const getInviteCode = (value: string) => value.trim().replace(/\/$/, "").split("/").pop() ?? "";

export const JoinServerModal = () => {
  const { isOpen, type, onClose } = useModal();
  const router = useRouter();
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const code = getInviteCode(invite);
    if (!code) { setError("Paste an invite link or invite code."); return; }
    setLoading(true); setError("");
    const response = await fetch(`/api/invites/${encodeURIComponent(code)}`, { method: "POST" });
    if (!response.ok) { setError("That invite is invalid or could not be used."); setLoading(false); return; }
    const data = await response.json() as { serverId: string };
    setInvite(""); setLoading(false); onClose(); router.push(`/servers/${data.serverId}`); router.refresh();
  };

  const close = () => { setInvite(""); setError(""); onClose(); };

  return <Dialog open={isOpen && type === "joinServer"} onOpenChange={close}><DialogContent className="border border-[#111214] bg-[#2b2d31] text-white"><DialogHeader><DialogTitle className="text-xl font-bold">Join a server</DialogTitle><DialogDescription className="text-[#949ba4]">Enter an invite link or code to join a community.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="relative"><Link2 className="absolute left-3 top-3 h-4 w-4 text-[#949ba4]" /><Input value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="https://syncmove.dev/invite/..." className="h-11 border-[#111214] bg-[#1e1f22] pl-9 text-white placeholder:text-[#70757e]" autoFocus /></div>{error && <p className="text-sm text-[#f23f42]">{error}</p>}<DialogFooter><Button type="button" variant="ghost" className="text-[#b5bac1] hover:text-white" onClick={close}>Cancel</Button><Button type="submit" disabled={loading} className="bg-[#5865f2] text-white hover:bg-[#4752c4]">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{loading ? "Joining…" : "Join server"}</Button></DialogFooter></form></DialogContent></Dialog>;
};
