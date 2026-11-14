"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "@/hooks/use-modal-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const CreateChannelModal = () => {
  const { isOpen, type, data, onClose } = useModal();
  const router = useRouter();
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState("TEXT");
  const [loading, setLoading] = useState(false);

  if (!isOpen || type !== "createChannel" || !data?.serverId) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverId: data.serverId, name, type: channelType }) });
    if (response.ok) { setName(""); onClose(); router.refresh(); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-[#2b2d31] p-6 shadow-2xl border border-white/5">
        <h2 className="text-xl font-bold text-white">Create channel</h2>
        <p className="mt-1 text-sm text-[#949ba4]">Add a new space for your server.</p>
        
        <Input 
          className="mt-5 rounded-xl bg-[#383a40] border-0 focus-visible:ring-1 focus-visible:ring-[#5865f2] text-white placeholder:text-[#949ba4]" 
          value={name} 
          onChange={(event) => setName(event.target.value)} 
          placeholder="channel-name" 
          autoFocus 
        />
        
        <select 
          value={channelType} 
          onChange={(event) => setChannelType(event.target.value)}
          className="mt-3 h-11 w-full rounded-xl border-0 bg-[#383a40] px-3 text-sm text-white focus-visible:ring-1 focus-visible:ring-[#5865f2]"
        >
          <option value="TEXT">Text</option>
          <option value="AUDIO">Voice</option>
          <option value="VIDEO">Video</option>
        </select>
        
        <div className="mt-6 flex justify-end gap-2">
          <Button 
            type="button" 
            variant="ghost" 
            onClick={onClose}
            className="rounded-xl hover:bg-[#35373c] text-[#b5bac1] hover:text-white"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={loading || !name.trim()}
            className="rounded-xl bg-[#5865f2] hover:bg-[#4752c4] text-white"
          >
            {loading ? "Creating…" : "Create channel"}
          </Button>
        </div>
      </form>
    </div>
  );
};