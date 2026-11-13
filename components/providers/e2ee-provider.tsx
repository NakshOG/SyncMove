"use client";

/**
 * E2EE Provider Component
 *
 * Wraps the application with E2EE context, providing encryption
 * capabilities to all chat components.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useE2EE } from "@/hooks/use-e2ee";

interface E2EEContextValue {
  // E2EE state
  initialized: boolean;
  hasKeyBundle: boolean;
  isLoading: boolean;

  // Message operations
  encryptForChannel: (
    channelId: string,
    plaintext: string,
  ) => Promise<string | null>;
  decryptFromChannel: (
    channelId: string,
    ciphertext: string,
  ) => Promise<string | null>;

  // Session operations
  establishChannelSession: (
    channelId: string,
    memberIds: string[],
  ) => Promise<void>;

  // Key management
  uploadKeyBundle: () => Promise<boolean>;
}

const E2EEContext = createContext<E2EEContextValue | null>(null);

export function useE2EEContext() {
  const context = useContext(E2EEContext);
  if (!context) {
    throw new Error("useE2EEContext must be used within E2EEProvider");
  }
  return context;
}

export function E2EEProvider({ children }: { children: ReactNode }) {
  const e2ee = useE2EE();
  const [channelSessions, setChannelSessions] = useState<Map<string, string[]>>(
    new Map(),
  );

  /**
   * Encrypt a message for a channel
   * Note: Channels use a shared key derived from all members' sessions
   * For MVP, we encrypt per-recipient and upload multiple ciphertexts
   */
  const encryptForChannel = async (
    channelId: string,
    plaintext: string,
  ): Promise<string | null> => {
    // For channel messages, we need to establish sessions with all members
    // then create a shared sender key for efficient encryption

    const memberIds = channelSessions.get(channelId) ?? [];

    if (memberIds.length === 0) {
      console.error(
        "[E2EE] No channel sessions established; refusing to send plaintext.",
      );
      return null;
    }

    // Encrypt for each member (simplified - production would use Sender Keys)
    const encryptedPerMember: { userId: string; ciphertext: string }[] = [];

    for (const memberId of memberIds) {
      const ciphertext = await e2ee.encryptMessage(memberId, plaintext);
      if (ciphertext) {
        encryptedPerMember.push({
          userId: memberId,
          ciphertext: Array.from(ciphertext).join(","),
        });
      }
    }

    if (encryptedPerMember.length === 0) {
      console.error("[E2EE] Failed to encrypt channel payload for any member.");
      return null;
    }

    return JSON.stringify({
      v: 1, // Version
      type: "channel",
      encrypted: encryptedPerMember,
    });
  };

  /**
   * Decrypt a channel message
   */
  const decryptFromChannel = async (
    channelId: string,
    ciphertext: string,
  ): Promise<string | null> => {
    // Check if it's encrypted format
    if (!ciphertext.startsWith("{")) {
      return null;
    }

    try {
      const parsed = JSON.parse(ciphertext);

      if (parsed.v === 1 && parsed.type === "channel") {
        // Find our ciphertext in the array
        const memberIds = channelSessions.get(channelId) ?? [];

        for (const enc of parsed.encrypted) {
          // Try to decrypt with any session we have
          const ciphertextBytes = new Uint8Array(
            enc.ciphertext.split(",").map(Number),
          );
          const decrypted = await e2ee.decryptMessage(
            enc.userId,
            ciphertextBytes,
          );
          if (decrypted) return decrypted;
        }
      }

      return null;
    } catch {
      return null;
    }
  };

  /**
   * Establish E2EE sessions with all channel members
   */
  const establishChannelSession = async (
    channelId: string,
    memberIds: string[],
  ) => {
    setChannelSessions((prev) => new Map(prev).set(channelId, memberIds));

    // Establish sessions with each member
    for (const memberId of memberIds) {
      try {
        await e2ee.establishSession(memberId);
      } catch (error) {
        console.error("[E2EE] Unable to establish channel member session", memberId, error);
      }
    }
  };

  return (
    <E2EEContext.Provider
      value={{
        initialized: e2ee.initialized,
        hasKeyBundle: e2ee.hasKeyBundle,
        isLoading: e2ee.isLoading,
        encryptForChannel,
        decryptFromChannel,
        establishChannelSession,
        uploadKeyBundle: e2ee.uploadKeyBundle,
      }}
    >
      {children}
    </E2EEContext.Provider>
  );
}
