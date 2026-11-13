"use client";

/**
 * E2EE Provider Component
 *
 * Wraps the application with E2EE context, providing encryption
 * capabilities to all chat components.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
    recipientId?: string,
  ) => Promise<string | null>;

  // Session operations
  establishChannelSession: (
    channelId: string,
    memberIds: string[],
    localProfileId?: string,
  ) => Promise<void>;

  // Key management
  uploadKeyBundle: () => Promise<boolean>;
  exportKeys: (password: string) => Promise<string | null>;
  importKeys: (password: string, backup: string) => Promise<boolean>;
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
  const { uploadKeyBundle, establishSession, getLocalBundle } = e2ee;
  const keyBundlePublished = useRef(false);
  const peerRetryAt = useRef<Map<string, number>>(new Map());
  const channelSetup = useRef<Map<string, Promise<void>>>(new Map());
  const localProfileIdRef = useRef<string | null>(null);
  const channelMembersRef = useRef<Map<string, string[]>>(new Map());
  const [channelSessions, setChannelSessions] = useState<Map<string, string[]>>(
    new Map(),
  );
  const channelSessionsRef = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!e2ee.initialized || keyBundlePublished.current) return;
    keyBundlePublished.current = true;
    void uploadKeyBundle().then((published) => {
      if (!published) keyBundlePublished.current = false;
    });
  }, [e2ee.initialized, uploadKeyBundle]);

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

    let memberIds = channelMembersRef.current.get(channelId)
      ?? channelSessionsRef.current.get(channelId)
      ?? channelSessions.get(channelId)
      ?? [];

    // The channel page establishes sessions asynchronously after loading its
    // member list. If the user sends immediately, wait for that one in-flight
    // setup instead of failing with a false "channel unavailable" error.
    const pending = channelSetup.current.get(channelId);
    if (memberIds.length === 0 && pending) {
      await pending;
      memberIds = channelMembersRef.current.get(channelId)
        ?? channelSessionsRef.current.get(channelId)
        ?? channelSessions.get(channelId)
        ?? [];
    }

    if (memberIds.length === 0) {
      console.error(
        "[E2EE] No channel sessions established; refusing to send plaintext.",
      );
      return null;
    }

    const groupPayload = await e2ee.encryptGroupMessage(
      memberIds,
      plaintext,
      localProfileIdRef.current ?? undefined,
    );
    if (!groupPayload) {
      console.error("[E2EE] Failed to encrypt channel payload for any member.");
      return null;
    }
    return groupPayload;
  };

  /**
   * Decrypt a channel message
   */
  const decryptFromChannel = async (
    channelId: string,
    ciphertext: string,
    recipientId?: string,
  ): Promise<string | null> => {
    // Check if it's encrypted format
    if (!ciphertext.startsWith("{")) {
      return null;
    }

    try {
      const parsed = JSON.parse(ciphertext);

      if (parsed.v === 2 && parsed.type === "group") {
        const preferredId = recipientId ?? localProfileIdRef.current;
        if (!preferredId) return null;
        return e2ee.decryptGroupMessage(preferredId, ciphertext);
      }

      if (parsed.v === 1 && parsed.type === "channel") {
        // Find our ciphertext in the array
        const preferredId = recipientId ?? localProfileIdRef.current;
        const entries = preferredId
          ? parsed.encrypted.filter((entry: { userId?: string }) => entry.userId === preferredId)
          : parsed.encrypted;
        for (const enc of entries) {
          // A channel envelope contains one ciphertext per recipient. A
          // ciphertext for another member must not abort decryption for the
          // current member; continue until the matching session succeeds.
          try {
            const ciphertextBytes = new Uint8Array(
              enc.ciphertext.split(",").map(Number),
            );
            const decrypted = await e2ee.decryptMessage(
              enc.userId,
              ciphertextBytes,
            );
            if (decrypted) return decrypted;
          } catch {
            continue;
          }
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
  const establishChannelSession = useCallback(async (
    channelId: string,
    memberIds: string[],
    localProfileId?: string,
  ) => {
    const setup = (async () => {
    if (localProfileId) localProfileIdRef.current = localProfileId;
    channelMembersRef.current.set(channelId, [...new Set(memberIds)]);
    // A newly signed-in browser may still be publishing its own bundle while
    // the channel page is loading. Ensure that step has completed before
    // attempting peer sessions.
    if (e2ee.initialized) {
      await uploadKeyBundle();
    }

    const now = Date.now();
    const established: string[] = [];
    for (const memberId of [...new Set(memberIds)]) {
      const retryKey = `${channelId}:${memberId}`;
      if ((peerRetryAt.current.get(retryKey) ?? 0) > now) continue;
      try {
        const localBundle = memberId === localProfileId ? await getLocalBundle() : null;
        if (await establishSession(memberId, localBundle)) {
          peerRetryAt.current.delete(retryKey);
          established.push(memberId);
        } else {
          peerRetryAt.current.set(retryKey, now + 30_000);
        }
      } catch {
        peerRetryAt.current.set(retryKey, now + 30_000);
      }
    }
      channelSessionsRef.current.set(channelId, established);
      setChannelSessions((prev) => new Map(prev).set(channelId, established));
    })();
    channelSetup.current.set(channelId, setup);
    try {
      await setup;
    } finally {
      if (channelSetup.current.get(channelId) === setup) {
        channelSetup.current.delete(channelId);
      }
    }
  }, [e2ee.initialized, uploadKeyBundle, establishSession, getLocalBundle]);

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
        exportKeys: e2ee.exportKeys,
        importKeys: e2ee.importKeys,
      }}
    >
      {children}
    </E2EEContext.Provider>
  );
}
