"use client";

import Image from "next/image";
import { Headphones, Mic, MicOff, Settings, VolumeX } from "lucide-react";
import { useState } from "react";

export const UserControls = ({
  imageUrl,
  name,
  status,
}: {
  imageUrl: string;
  name: string;
  status: string;
}) => {
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const publishAudioState = (nextMuted: boolean, nextDeafened: boolean) => {
    window.dispatchEvent(new CustomEvent("syncmove:audio-controls", { detail: { muted: nextMuted, deafened: nextDeafened } }));
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    publishAudioState(nextMuted, deafened);
  };

  const toggleDeafen = () => {
    const nextDeafened = !deafened;
    setDeafened(nextDeafened);
    publishAudioState(nextDeafened ? true : muted, nextDeafened);
  };

  return (
    <div className="relative flex items-center gap-2 border-t border-[#111214] bg-[#232428] px-2 py-2">
      <Image src={imageUrl} alt={name} width={34} height={34} unoptimized className="h-8 w-8 rounded-full" />
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{name}</p><p className="text-[10px] text-[#949ba4]">{status}</p></div>
      <button type="button" title={muted ? "Unmute microphone" : "Mute microphone"} aria-label={muted ? "Unmute microphone" : "Mute microphone"} onClick={toggleMute} className={`rounded p-1.5 transition hover:bg-[#35373c] ${muted ? "text-[#f23f42]" : "text-[#b5bac1] hover:text-white"}`}>
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
      <button type="button" title={deafened ? "Undeafen" : "Deafen"} aria-label={deafened ? "Undeafen" : "Deafen"} onClick={toggleDeafen} className={`rounded p-1.5 transition hover:bg-[#35373c] ${deafened ? "text-[#f23f42]" : "text-[#b5bac1] hover:text-white"}`}>
        {deafened ? <VolumeX className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
      </button>
      <button type="button" title="User settings" aria-label="User settings" onClick={() => setSettingsOpen((value) => !value)} className={`rounded p-1.5 transition hover:bg-[#35373c] ${settingsOpen ? "bg-[#35373c] text-white" : "text-[#b5bac1] hover:text-white"}`}>
        <Settings className="h-4 w-4" />
      </button>
      {settingsOpen && <div className="absolute bottom-12 right-2 z-30 w-52 rounded-lg border border-[#111214] bg-[#111214] p-3 text-xs text-[#dbdee1] shadow-2xl"><p className="font-semibold text-white">User controls</p><p className="mt-1 text-[#949ba4]">Microphone: {muted ? "muted" : "active"}</p><p className="text-[#949ba4]">Audio output: {deafened ? "deafened" : "active"}</p></div>}
    </div>
  );
};
