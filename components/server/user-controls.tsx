"use client";

import Image from "next/image";
import { Headphones, Mic, MicOff, Settings, VolumeX } from "lucide-react";
import { useState } from "react";
import { useE2EEContext } from "@/components/providers/e2ee-provider";

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
  const [backupPassword, setBackupPassword] = useState("");
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const { initialized, exportKeys, importKeys } = useE2EEContext();

  const publishAudioState = (nextMuted: boolean, nextDeafened: boolean) => {
    window.localStorage.setItem("syncmove:audio-controls", JSON.stringify({ muted: nextMuted, deafened: nextDeafened }));
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

  const downloadKeyBackup = async () => {
    if (!backupPassword) {
      setBackupStatus("Enter a backup password first.");
      return;
    }
    const backup = await exportKeys(backupPassword);
    if (!backup) {
      setBackupStatus("Unable to create key backup.");
      return;
    }
    const url = URL.createObjectURL(new Blob([backup], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "syncmove-e2ee-key-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    setBackupStatus("Encrypted backup downloaded.");
  };

  const restoreKeyBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !backupPassword) {
      setBackupStatus("Choose a backup and enter its password.");
      return;
    }
    const success = await importKeys(backupPassword, await file.text());
    setBackupStatus(success ? "Keys restored. Refresh to reconnect securely." : "Unable to restore this backup.");
  };

  return (
    <div className="relative flex items-center gap-2 border-t border-white/5 bg-[#232428] px-2 py-2">
      <Image src={imageUrl} alt={name} width={34} height={34} unoptimized className="h-8 w-8 rounded-full" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{name}</p>
        <p className="text-[10px] text-[#949ba4]">{status}</p>
      </div>
      
      <button
        type="button"
        title={muted ? "Unmute microphone" : "Mute microphone"}
        aria-label={muted ? "Unmute microphone" : "Mute microphone"}
        onClick={toggleMute}
        className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${muted ? "text-[#f23f42]" : "text-[#b5bac1] hover:text-white"}`}
      >
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
      
      <button
        type="button"
        title={deafened ? "Undeafen" : "Deafen"}
        aria-label={deafened ? "Undeafen" : "Deafen"}
        onClick={toggleDeafen}
        className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${deafened ? "text-[#f23f42]" : "text-[#b5bac1] hover:text-white"}`}
      >
        {deafened ? <VolumeX className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
      </button>
      
      <button
        type="button"
        title="User settings"
        aria-label="User settings"
        onClick={() => setSettingsOpen((value) => !value)}
        className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${settingsOpen ? "bg-[#35373c] text-white" : "text-[#b5bac1] hover:text-white"}`}
      >
        <Settings className="h-4 w-4" />
      </button>
      
      {settingsOpen && (
        <div className="absolute bottom-full right-2 z-50 mb-2 w-52 rounded-xl border border-white/5 bg-[#111214] p-4 text-xs text-[#dbdee1] shadow-2xl">
          <p className="font-semibold text-white mb-2">User controls</p>
          <div className="space-y-1">
            <p className="text-[#949ba4]">Microphone: <span className={muted ? "text-[#f23f42]" : "text-[#23a559]"}>{muted ? "muted" : "active"}</span></p>
            <p className="text-[#949ba4]">Audio output: <span className={deafened ? "text-[#f23f42]" : "text-[#23a559]"}>{deafened ? "deafened" : "active"}</span></p>
          </div>
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="font-semibold text-white">Encryption keys</p>
            <p className="mt-1 text-[10px] text-[#949ba4]">
              {initialized ? "Stored on this device" : "Initializing..."}. The server never receives private keys.
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[#949ba4]">
              Export creates a password-encrypted backup of your identity key and saved sessions. Keep it offline; losing both this device and the backup can make old messages unreadable.
            </p>
            <input
              type="password"
              value={backupPassword}
              onChange={(event) => setBackupPassword(event.target.value)}
              placeholder="Backup password"
              className="mt-2 w-full rounded bg-[#2b2d31] px-2 py-1.5 text-xs text-white outline-none ring-[#5865f2] placeholder:text-[#949ba4] focus:ring-1"
            />
            <div className="mt-2 flex gap-1">
              <button type="button" onClick={() => void downloadKeyBackup()} className="flex-1 rounded bg-[#5865f2] px-2 py-1.5 text-[10px] text-white hover:bg-[#4752c4]">
                Export backup
              </button>
              <label className="flex-1 cursor-pointer rounded bg-[#35373c] px-2 py-1.5 text-center text-[10px] text-white hover:bg-[#404249]">
                Import backup
                <input type="file" accept="application/json,.json" onChange={(event) => void restoreKeyBackup(event)} className="hidden" />
              </label>
            </div>
            {backupStatus && <p className="mt-2 text-[10px] text-[#a5b4fc]">{backupStatus}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
