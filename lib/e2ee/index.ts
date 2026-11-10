
/**
 * E2EE Module Exports
 *
 * Zero-knowledge end-to-end encryption based on Signal Protocol.
 *
 * References:
 * - https://signal.org/docs/specifications/x3dh/
 * - https://signal.org/docs/specifications/doubleratchet/
 */

// ============================================================
// IMPORTS REQUIRED BY LOCAL FUNCTIONS
// ============================================================

import {
  type IdentityKeyPair,
  type KeyBundle,
  type SignedPreKeyPair,
  type OneTimePreKeyPair,
  generateKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  createKeyBundle,
} from "./x3dh";

import type { SessionManager } from "./session";

import {
  toBase64,
  fromBase64,
} from "./sha256";

// ============================================================
// X3DH KEY EXCHANGE
// ============================================================

export {
  type IdentityKeyPair,
  type SignedPreKeyPair,
  type OneTimePreKeyPair,
  type KeyBundle,
  type InitialMessage,
  type X3DHResult,

  generateKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  createKeyBundle,
  x3dhInitiator,
  x3dhResponder,
  serializeKeyBundle,
  deserializeKeyBundle,
} from "./x3dh";

// ============================================================
// DOUBLE RATCHET
// ============================================================

export {
  type DoubleRatchetState,
  type MessageHeader,
  type EncryptedMessage,
  type InitialState,

  createInitialState,
  encryptMessage,
  decryptMessage,
  generateRatchetKeyPair,
  serializeState,
  deserializeState,
} from "./double-ratchet";

// ============================================================
// KEY STORAGE
// ============================================================

export {
  type KeyStorage,
  IndexedDBKeyStorage,
  type SessionData,
  SessionStorage,
  BundleStorage,

  keyStorage,
  sessionStorage,
  bundleStorage,

  exportKeysWithPassword,
  importKeysFromPassword,
} from "./key-storage";

// ============================================================
// SESSION MANAGEMENT
// ============================================================

export {
  type SessionStatus,
  type E2EESession,

  SessionManager,
  sessionManager,
} from "./session";

// ============================================================
// FILE ENCRYPTION
// ============================================================

export {
  type EncryptedFileMetadata,
  type EncryptedFile,
  type EncryptionResult,
  type EncryptionProgressCallback,

  encryptFile,
  decryptFile,
  generateFileKey,
  encryptKeyForRecipients,
  decryptKeyForRecipient,

  // Aliases avoid duplicate exports.
  compress as compressFile,
  decompress as decompressFile,

  encryptFileWithProgress,
  calculateCompressionRatio,
} from "./file-encryption";

// ============================================================
// COMPRESSION
// ============================================================

export {
  type CompressionAlgorithm,
  type CompressionResult,

  getAvailableCompression,

  // These are the default compression exports.
  compress,
  decompress,

  compressText,
  decompressToText,
  estimateCompressionRatio,
  shouldCompress,

  StreamingCompressor,
  StreamingDecompressor,
} from "./compression";

// ============================================================
// SHA256 UTILITIES
// ============================================================

export {
  sha256,
  sha256Hex,
  concatArrays,
  toBase64,
  fromBase64,
  randomBytes,
} from "./sha256";

// ============================================================
// HKDF
// ============================================================

export {
  hkdf,
  hkdfExtract,
  hkdfExpand,
  deriveMessageKeys,
} from "./hkdf";

// ============================================================
// INITIALIZE E2EE
// ============================================================

export async function initializeE2EE(): Promise<{
  identityKey: IdentityKeyPair;
  signedPreKey: SignedPreKeyPair;
  oneTimePreKeys: OneTimePreKeyPair[];
  keyBundle: KeyBundle;
}> {
  // Generate identity key pair.
  const identityKey = await generateKeyPair();

  // Generate signed pre-key.
  const signedPreKey = await generateSignedPreKey(identityKey);

  // Generate one-time pre-keys.
  const oneTimePreKeys = await generateOneTimePreKeys(100);

  if (!oneTimePreKeys || oneTimePreKeys.length === 0) {
    throw new Error("Failed to generate one-time pre-keys");
  }

  // Create key bundle.
  const keyBundle = await createKeyBundle(
    identityKey,
    signedPreKey,
    oneTimePreKeys[0]
  );

  return {
    identityKey,
    signedPreKey,
    oneTimePreKeys,
    keyBundle,
  };
}

// ============================================================
// ENCRYPTED MESSAGE PAYLOAD
// ============================================================

export interface EncryptedPayload {
  version: number;
  senderId: string;
  sessionId: string;
  encrypted: string;
  timestamp: number;
}

// ============================================================
// ENCRYPT MESSAGE FOR PEER
// ============================================================

export async function encryptForPeer(
  message: string,
  peerId: string,
  manager: SessionManager
): Promise<EncryptedPayload> {
  if (!message) {
    throw new Error("Message cannot be empty");
  }

  if (!peerId) {
    throw new Error("Peer ID is required");
  }

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(message);

  const result = await manager.encryptForPeer(
    peerId,
    plaintext
  );

  return {
    version: 1,

    // Uses the existing SessionManager identity property.
    senderId: (manager as unknown as {
      myKeyId: string;
    }).myKeyId,

    sessionId: result.sessionId,

    encrypted: toBase64(result.ciphertext),

    timestamp: Date.now(),
  };
}

// ============================================================
// DECRYPT MESSAGE FROM PEER
// ============================================================

export async function decryptFromPeer(
  payload: EncryptedPayload,
  manager: SessionManager
): Promise<string> {
  if (payload.version !== 1) {
    throw new Error(
      `Unsupported E2EE version: ${payload.version}`
    );
  }

  if (!payload.senderId || !payload.encrypted) {
    throw new Error("Invalid encrypted message payload");
  }

  const encrypted = fromBase64(payload.encrypted);

  const plaintext = await manager.decryptFromPeer(
    payload.senderId,
    encrypted
  );

  const decoder = new TextDecoder();

  return decoder.decode(plaintext);
}
