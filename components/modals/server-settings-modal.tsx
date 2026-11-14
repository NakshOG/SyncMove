"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "@/hooks/use-modal-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUpload } from "@/components/ui/file-upload";

export const ServerSettingsModal = () => {
  const { isOpen, type, data, onClose } = useModal();
  const router = useRouter();
  const [name, setName] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!isOpen || type !== "serverSettings") return; const sync = window.setTimeout(() => { setName(data?.serverName ?? ""); setImageURL(data?.serverImageURL ?? ""); }, 0); return () => window.clearTimeout(sync); }, [data, isOpen, type]);
  if (!isOpen || type !== "serverSettings" || !data?.serverId) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true);
    const response = await fetch(`/api/servers/${data.serverId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, imageURL }) });
    if (response.ok) { onClose(); router.refresh(); }
    setLoading(false);
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-[#313338]"><h2 className="text-xl font-bold">Server settings</h2><label className="mt-5 block text-xs font-semibold uppercase text-zinc-500">Server name</label><Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /><label className="mt-4 block text-xs font-semibold uppercase text-zinc-500">Server image</label><div className="mt-2"><FileUpload endpoint="ServerImage" value={imageURL} onChange={(url) => setImageURL(url ?? "")} /></div><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={loading || !name.trim() || !imageURL.trim()}>{loading ? "Saving..." : "Save changes"}</Button></div></form></div>;
};
