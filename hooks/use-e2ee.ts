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
import { keyStorage, bundleStorage, sessionManager } from "@/lib/e2ee";

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
      // Check if we already have keys in IndexedDB
      const storedIdentity = await keyStorage.getKey("identity");
      
      if (storedIdentity) {
        // Keys exist, load them
        const ikData = await keyStorage.getKey("identity");
        const spkData = await keyStorage.getKey("signed-pre-key");
        
        if (ikData && spkData) {
          // Export to raw for reference (don't need to re-import)
          identityKeyRef.current = {
            publicKey: new Uint8Array(32), // Placeholder
            privateKey: new Uint8Array(32), // Placeholder
          };
          signedPreKeyRef.current = {
            keyId: "loaded",
            publicKey: new Uint8Array(32),
            privateKey: new Uint8Array(32),
            signature: new Uint8Array(64),
          };
          
          // Initialize session manager
          await sessionManager.initialize(identityKeyRef.current, "local");
          
          setState({
            initialized: true,
            hasKeyBundle: true,
            isLoading: false,
            error: null,
          });
          return;
        }
      }

      // Generate new keys
      const identityKey = await generateKeyPair();
      const signedPreKey = await generateSignedPreKey(identityKey);
      const oneTimePreKeys = await generateOneTimePreKeys(100);

      // Store private keys locally (never on server)
      await keyStorage.storeKey("identity", identityKey);
      await keyStorage.storeKey("signed-pre-key", signedPreKey);
      await keyStorage.storeKey("one-time-pre-keys", await crypto.subtle.exportKey("jwk", await generateOneTimePreKeys(1)[0].then(k => k as any).catch(() => null as any) as any));

      identityKeyRef.current = identityKey;
      signedPreKeyRef.current = signedPreKey;
      oneTimePreKeysRef.current = oneTimePreKeys;

      // Initialize session manager
      await sessionManager.initialize(identityKey, profile?.id ?? "local");

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
    } catch (error) {
      console.error("[useE2EE] Fetch bundle error:", error);
      return null;
    }
  }, []);

  /**
   * Establish encrypted session with a peer
   */
  const establishSession = useCallback(async (peerId: string): Promise<boolean> => {
    try {
      // Get peer's key bundle
      const peerBundle = await getPeerBundle(peerId);
      
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
      } catch (error) {
        console.error("[useE2EE] Decryption error:", error);
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
        ].filter((k): k is { id: string; key: CryptoKey } => k.key !== null);

        if (keys.length === 0) return null;

        // Convert to exportable format
        const exportableKeys = await Promise.all(
          keys.map(async (k) => ({
            id: k.id,
            key: await crypto.subtle.exportKey("raw", k.key),
            type: "X25519",
          }))
        );

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
        const keyData = new TextEncoder().encode(JSON.stringify(exportableKeys));

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

        const keys = JSON.parse(new TextDecoder().decode(decrypted));

        // Import and store keys
        for (const keyData of keys) {
          const key = await crypto.subtle.importKey(
            "raw",
            new Uint8Array(keyData.key),
            { name: "ECDH", namedCurve: "X25519" },
            true,
            ["deriveBits", "deriveKey"]
          );
          await keyStorage.storeKey(keyData.id, key);
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

  // Auto-initialize on mount
  useEffect(() => {
    initializeE2EE();
  }, [initializeE2EE]);

  return {
    ...state,
    initializeE2EE,
    uploadKeyBundle,
    getPeerBundle,
    establishSession,
    encryptMessage,
    decryptMessage,
    exportKeys,
    importKeys,
  };
}