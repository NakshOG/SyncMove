"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  Hash,
  Pin,
  Search,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { ChannelType } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/input";

export const ChatHeader = ({
  name,
  type,
}: {
  name: string;
  type: ChannelType;
}) => {
  const Icon =
    type === ChannelType.TEXT
      ? Hash
      : type === ChannelType.AUDIO
        ? Volume2
        : Video;
  const description =
    type === ChannelType.TEXT
      ? "Share thoughts, files, and updates"
      : type === ChannelType.AUDIO
        ? "Drop in and talk with your team"
        : "Meet face to face with your team";
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Keep the first render identical on the server and client. Browser
  // notification permission is only available after hydration.
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showPinned, setShowPinned] = useState(false);

  useEffect(() => {
    const updatePermission = () => {
      if ("Notification" in window) {
        setNotificationsEnabled(Notification.permission === "granted");
      }
    };
    const frame = window.requestAnimationFrame(updatePermission);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("syncmove:channel-search", { detail: { query } }),
    );
  }, [query]);

  const toggleNotifications = async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default")
      await Notification.requestPermission();
    const enabled = Notification.permission === "granted";
    setNotificationsEnabled(enabled);
    window.dispatchEvent(
      new CustomEvent("syncmove:notifications", { detail: { enabled } }),
    );
  };

  const togglePinned = () => {
    const next = !showPinned;
    setShowPinned(next);
    window.dispatchEvent(
      new CustomEvent("syncmove:show-pinned", { detail: { show: next } }),
    );
  };

  const closeSearch = () => {
    setQuery("");
    setSearchOpen(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#111214] bg-[#1e1f22] px-4 text-[#b5bac1] shadow-sm">
      <Icon className="h-5 w-5 text-[#f2f3f5]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold text-white">
            {name}
          </h1>
          <span className="hidden h-4 w-px bg-[#4a4d52] sm:block" />
          <p className="hidden truncate text-xs text-[#949ba4] sm:block">
            {description}
          </p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {searchOpen && (
          <div className="relative hidden w-56 sm:block">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages"
              className="h-8 border-0 bg-[#111214] pr-8 text-xs text-white placeholder:text-[#949ba4]"
            />
            <button
              type="button"
              title="Close search"
              onClick={closeSearch}
              className="absolute right-1 top-1.5 rounded p-1 text-[#949ba4] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <button
          type="button"
          title={
            notificationsEnabled
              ? "Disable notifications"
              : "Enable notifications"
          }
          aria-pressed={notificationsEnabled}
          onClick={() => void toggleNotifications()}
          className={`rounded p-2 transition hover:bg-[#35373c] hover:text-white ${notificationsEnabled ? "text-[#a5b4fc]" : ""}`}
        >
          {notificationsEnabled ? (
            <Bell className="h-[18px] w-[18px]" />
          ) : (
            <BellOff className="h-[18px] w-[18px]" />
          )}
        </button>
        <button
          type="button"
          title={showPinned ? "Show all messages" : "Show pinned messages"}
          aria-pressed={showPinned}
          onClick={togglePinned}
          className={`rounded p-2 transition hover:bg-[#35373c] hover:text-white ${showPinned ? "text-[#a5b4fc]" : ""}`}
        >
          <Pin className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          title="Search messages"
          aria-pressed={searchOpen}
          onClick={() => setSearchOpen((value) => !value)}
          className={`rounded p-2 transition hover:bg-[#35373c] hover:text-white ${searchOpen ? "bg-[#35373c] text-white" : ""}`}
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
};
