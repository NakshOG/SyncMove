"use client";

import { CreateServerModal } from "@/components/modals/create-server-modal";
import { CreateChannelModal } from "@/components/modals/create-channel-modal";
import { ServerSettingsModal } from "@/components/modals/server-settings-modal";
import { JoinServerModal } from "@/components/modals/join-server-modal";

export const ModalProvider = () => {
  return (
    <>
      <CreateServerModal />
      <CreateChannelModal />
      <ServerSettingsModal />
      <JoinServerModal />
    </>
  );
};
