/**
 * E2EE Hook for SyncMove
 * 
 * Provides end-to-end encryption functionality for messaging.
 * - Key generation and storage
 * - Session management
 * - Message encryption/decryption
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  createKeyBundle,
  deserializeKeyBundle,
  IdentityKeyPair,
  KeyBundle,
  SignedPreKeyPair,
  OneTimePreKeyPair,
} from "@/lib/e2ee";
import { decryptGroupMessage, encryptGroupMessage } from "@/lib/e2ee/group";
import { keyStorage, bundleStorage, sessionManager, sessionStorage, type SessionData } from "@/lib/e2ee";

interface E2EEState {
  initialized: boolean;
  hasKeyBundle: boolean;
  isLoading: boolean;
  error: string | null;
}

interface UseE2EEReturn extends E2EEState {
  // Key management
  initializeE2EE: () => Promise<void>;
  uploadKeyBundle: () => Promise<boolean>;
  getPeerBundle: (userId: string) => Promise<KeyBundle | null>;
  getLocalBundle: () => Promise<KeyBundle | null>;
  encryptGroupMessage: (recipientIds: string[], plaintext: string, localProfileId?: string) => Promise<string | null>;
  decryptGroupMessage: (recipientId: string, payload: string) => Promise<string | null>;
  
  // Session management
  establishSession: (peerId: string) => Promise<boolean>;
  
  // Message encryption
  encryptMessage: (peerId: string, plaintext: string) => Promise<Uint8Array | null>;
  decryptMessage: (peerId: string, ciphertext: Uint8Array) => Promise<string | null>;
  
  // Key backup
  exportKeys: (password: string) => Promise<string | null>;
  importKeys: (password: string, backup: string) => Promise<boolean>;
}

export function useE2EE(): UseE2EEReturn {
  const [state, setState] = useState<E2EEState>({
    initialized: false,
    hasKeyBundle: false,
    isLoading: false,
    error: null,
  });

  const identityKeyRef = useRef<IdentityKeyPair | null>(null);
  const signedPreKeyRef = useRef<SignedPreKeyPair | null>(null);
  const oneTimePreKeysRef = useRef<OneTimePreKeyPair[]>([]);

  /**
   * Initialize E2EE - generate keys and load from storage
   */
  const initializeE2EE = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        throw new Error("E2EE requires HTTPS on LAN; localhost is the only HTTP exception");
      }
      const storedIdentity = await keyStorage.getKey("identity");
      const storedSignedPreKey = await keyStorage.getKey("signed-pre-key");

      if (storedIdentity) {
        const identity = storedIdentity as IdentityKeyPair;
        if (identity.publicKey?.length === 32 && identity.privateKey?.length === 32) {
          identityKeyRef.current = identity;

          const storedPreKey = storedSignedPreKey as SignedPreKeyPair | null;
          if (
            storedPreKey?.publicKey?.length === 32 &&
            storedPreKey.privateKey?.length === 32 &&
            storedPreKey.signature?.length === 64
          ) {
            signedPreKeyRef.current = storedPreKey;
          } else {
            // Preserve the durable identity. Only repair the disposable
            // signed pre-key when an older/incomplete record is found.
            signedPreKeyRef.current = await generateSignedPreKey(identity);
            await keyStorage.storeKey("signed-pre-key", signedPreKeyRef.current);
          }

          oneTimePreKeysRef.current = (await generateOneTimePreKeys(100)) ?? [];
          await sessionManager.initialize(identityKeyRef.current, "local");

          setState({ initialized: true, hasKeyBundle: true, isLoading: false, error: null });
          return;
        }
      }

      const identityKey = await generateKeyPair();
      const signedPreKey = await generateSignedPreKey(identityKey);
      const oneTimePreKeys = await generateOneTimePreKeys(100);

      identityKeyRef.current = identityKey;
      signedPreKeyRef.current = signedPreKey;
      oneTimePreKeysRef.current = oneTimePreKeys;

      await keyStorage.storeKey("identity", identityKey);
      await keyStorage.storeKey("signed-pre-key", signedPreKey);

      await sessionManager.initialize(identityKey, "local");

      setState({
        initialized: true,
        hasKeyBundle: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error("[useE2EE] Initialization error:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Failed to initialize E2EE",
      }));
    }
  }, []);

  /**
   * Upload key bundle to server
   */
  const uploadKeyBundle = useCallback(async (): Promise<boolean> => {
    if (!identityKeyRef.current || !signedPreKeyRef.current) {
      setState((prev) => ({ ...prev, error: "E2EE not initialized" }));
      return false;
    }

    try {
      const oneTimePreKey = oneTimePreKeysRef.current[0];
      
      const bundle = await createKeyBundle(
        identityKeyRef.current,
        signedPreKeyRef.current,
        oneTimePreKey
      );

      if (!bundle.signedPreKeySignature) {
        throw new Error("Signed pre-key signature is missing; regenerate E2EE keys");
      }

      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityKey: Array.from(bundle.identityKey).join(","),
          signedPreKey: Array.from(bundle.signedPreKey).join(","),
          signature: Array.from(bundle.signedPreKeySignature).join(","),
          oneTimePreKeyId: bundle.oneTimePreKeyId,
          oneTimePreKey: bundle.oneTimePreKey ? Array.from(bundle.oneTimePreKey).join(",") : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to upload key bundle");
      }

      // Remove used OTPK from local
      oneTimePreKeysRef.current.shift();

      return true;
    } catch (error) {
      console.error("[useE2EE] Upload error:", error);
      setState((prev) => ({ ...prev, error: "Failed to upload key bundle" }));
      return false;
    }
  }, []);

  /**
   * Get a peer's key bundle from server
   */
  const getPeerBundle = useCallback(async (userId: string): Promise<KeyBundle | null> => {
    try {
      const response = await fetch(`/api/keys/${userId}`);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch key bundle");
      }

      const data = await response.json();
      
      // Cache locally for offline access
      await bundleStorage.saveBundle(userId, JSON.stringify(data));

      return deserializeKeyBundle(JSON.stringify(data));
    } catch {
      // A missing/offline peer is expected in a group. The caller retries with
      // backoff; do not flood the console or expose transport details in UI.
      return null;
    }
  }, []);

  const getLocalBundle = useCallback(async (): Promise<KeyBundle | null> => {
    if (!identityKeyRef.current || !signedPreKeyRef.current) return null;
    return createKeyBundle(
      identityKeyRef.current,
      signedPreKeyRef.current,
      oneTimePreKeysRef.current[0] ?? null,
    );
  }, []);

  const encryptGroupPayload = useCallback(async (recipientIds: string[], plaintext: string, localProfileId?: string): Promise<string | null> => {
    if (!identityKeyRef.current) return null;
    const recipients = [];
    for (const userId of [...new Set(recipientIds)]) {
      const bundle = userId === localProfileId
        ? await getLocalBundle()
        : await getPeerBundle(userId);
      // Never publish a partial group envelope. A member without a published
      // key would receive the message but could never decrypt it.
      if (!bundle) return null;
      recipients.push({ userId, identityKey: bundle.identityKey });
    }
    try {
      return await encryptGroupMessage(localProfileId ?? "local", plaintext, recipients);
    } catch {
      return null;
    }
  }, [getLocalBundle, getPeerBundle]);

  const decryptGroupPayload = useCallback(async (recipientId: string, payload: string): Promise<string | null> => {
    if (!identityKeyRef.current) return null;
    return decryptGroupMessage(payload, recipientId, identityKeyRef.current.privateKey);
  }, []);

  /**
   * Establish encrypted session with a peer
   */
  const establishSession = useCallback(async (peerId: string, localBundle?: KeyBundle | null): Promise<boolean> => {
    try {
      // Get peer's key bundle
      const peerBundle = localBundle ?? await getPeerBundle(peerId);
      
      if (!peerBundle) {
        setState((prev) => ({ ...prev, error: "Peer has no key bundle" }));
        return false;
      }

      if (!identityKeyRef.current) {
        setState((prev) => ({ ...prev, error: "E2EE not initialized" }));
        return false;
      }

      // Create session via X3DH
      const session = await sessionManager.createSession(peerId, peerBundle);

      return session.status === "pending" || session.status === "established";
    } catch (error) {
      console.error("[useE2EE] Session establishment error:", error);
      setState((prev) => ({ ...prev, error: "Failed to establish session" }));
      return false;
    }
  }, [getPeerBundle]);

  /**
   * Encrypt a message for a peer
   */
  const encryptMessage = useCallback(
    async (peerId: string, plaintext: string): Promise<Uint8Array | null> => {
      try {
        const encoder = new TextEncoder();
        const plaintextBytes = encoder.encode(plaintext);

        const { ciphertext } = await sessionManager.encryptForPeer(
          peerId,
          plaintextBytes
        );

        return ciphertext;
      } catch (error) {
        console.error("[useE2EE] Encryption error:", error);
        return null;
      }
    },
    []
  );

  /**
   * Decrypt a message from a peer
   */
  const decryptMessage = useCallback(
    async (peerId: string, ciphertext: Uint8Array): Promise<string | null> => {
      try {
        const plaintextBytes = await sessionManager.decryptFromPeer(peerId, ciphertext);
        
        const decoder = new TextDecoder();
        return decoder.decode(plaintextBytes);
      } catch {
        // Missing sessions and stale ciphertext are handled by the chat UI.
        return null;
      }
    },
    []
  );

  /**
   * Export keys for backup (encrypted with password)
   */
  const exportKeys = useCallback(
    async (password: string): Promise<string | null> => {
      try {
        const keys = [
          { id: "identity", key: identityKeyRef.current },
          { id: "signed-pre-key", key: signedPreKeyRef.current },
        ].filter((k): k is { id: string; key: IdentityKeyPair | SignedPreKeyPair } => k.key !== null);

        if (keys.length === 0) return null;

        const exportableKeys = keys.map((k) => ({
          id: k.id,
          key: {
            publicKey: Array.from(k.key.publicKey),
            privateKey: Array.from(k.key.privateKey),
            signingPublicKey: "signingPublicKey" in k.key ? Array.from(k.key.signingPublicKey ?? []) : undefined,
            signingPrivateKey: "signingPrivateKey" in k.key ? Array.from(k.key.signingPrivateKey ?? []) : undefined,
          },
          type: "X25519",
        }));

        const sessions = typeof sessionStorage.getAllSessions === "function"
          ? await sessionStorage.getAllSessions()
          : [];

        // Encrypt with password
        const passwordEncoder = new TextEncoder();
        const passwordBytes = passwordEncoder.encode(password);
        const salt = crypto.getRandomValues(new Uint8Array(16));

        const passwordKey = await crypto.subtle.importKey(
          "raw",
          passwordBytes,
          "PBKDF2",
          false,
          ["deriveKey"]
        );

        const encryptionKey = await crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt,
            iterations: 100000,
            hash: "SHA-256",
          },
          passwordKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const keyData = new TextEncoder().encode(JSON.stringify({
          version: 2,
          keys: exportableKeys,
          sessions,
        }));

        const encrypted = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          encryptionKey,
          keyData
        );

        return JSON.stringify({
          salt: Array.from(salt),
          iv: Array.from(iv),
          data: Array.from(new Uint8Array(encrypted)),
        });
      } catch (error) {
        console.error("[useE2EE] Export error:", error);
        return null;
      }
    },
    []
  );

  /**
   * Import keys from password-protected backup
   */
  const importKeys = useCallback(
    async (password: string, backup: string): Promise<boolean> => {
      try {
        const backupData = JSON.parse(backup);
        const salt = new Uint8Array(backupData.salt);
        const iv = new Uint8Array(backupData.iv);
        const encrypted = new Uint8Array(backupData.data);

        const passwordEncoder = new TextEncoder();
        const passwordBytes = passwordEncoder.encode(password);

        const passwordKey = await crypto.subtle.importKey(
          "raw",
          passwordBytes,
          "PBKDF2",
          false,
          ["deriveKey"]
        );

        const encryptionKey = await crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt,
            iterations: 100000,
            hash: "SHA-256",
          },
          passwordKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );

        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          encryptionKey,
          encrypted
        );

        const imported = JSON.parse(new TextDecoder().decode(decrypted)) as
          | { version?: number; keys?: unknown[]; sessions?: SessionData[] }
          | unknown[];
        const keys = Array.isArray(imported) ? imported : imported.keys ?? [];

        for (const keyData of keys) {
          const rawKey = keyData.key as { publicKey?: number[]; privateKey?: number[]; signingPublicKey?: number[]; signingPrivateKey?: number[] };
          if (!rawKey || !rawKey.publicKey || !rawKey.privateKey) continue;

          await keyStorage.storeKey(keyData.id, {
            publicKey: new Uint8Array(rawKey.publicKey),
            privateKey: new Uint8Array(rawKey.privateKey),
            signingPublicKey: rawKey.signingPublicKey ? new Uint8Array(rawKey.signingPublicKey) : undefined,
            signingPrivateKey: rawKey.signingPrivateKey ? new Uint8Array(rawKey.signingPrivateKey) : undefined,
          });
        }

        if (!Array.isArray(imported) && imported.sessions) {
          for (const session of imported.sessions) {
            if (session?.sessionId && session.peerId && session.state) {
              await sessionStorage.saveSession(session);
            }
          }
        }

        await initializeE2EE();
        return true;
      } catch (error) {
        console.error("[useE2EE] Import error:", error);
        return false;
      }
    },
    [initializeE2EE]
  );

  // Auto-initialize on mount without synchronously calling setState inside the effect body.
  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!active) return;
      await initializeE2EE();
    };

    void run();

    return () => {
      active = false;
    };
  }, [initializeE2EE]);

  return {
    ...state,
    initializeE2EE,
    uploadKeyBundle,
    getPeerBundle,
    getLocalBundle,
    encryptGroupMessage: encryptGroupPayload,
    decryptGroupMessage: decryptGroupPayload,
    establishSession,
    encryptMessage,
    decryptMessage,
    exportKeys,
    importKeys,
  };
}
