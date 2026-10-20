import { create } from "zustand";

export type ModalType = "createServer" | "createChannel" | "serverSettings" | "joinServer";

interface ModalStore {
  type: ModalType | null;
  isOpen: boolean;
  data?: { serverId?: string; serverName?: string; serverImageURL?: string };
  onOpen: (type: ModalType, data?: { serverId?: string; serverName?: string; serverImageURL?: string }) => void;
  onClose: () => void;
}

export const useModal = create<ModalStore>((set) => ({
  type: null,
  isOpen: false,
  onOpen: (type, data) => set({ isOpen: true, type, data }),
  onClose: () => set({ type: null, isOpen: false }),
}));
