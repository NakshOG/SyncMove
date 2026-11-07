/**
 * E2EE Module Exports
 * 
 * Zero-knowledge end-to-end encryption based on Signal Protocol
 * 
 * References:
 * - https://signal.org/docs/specifications/x3dh/
 * - https://signal.org/docs/specifications/doubleratchet/
 */

// X3DH Key Exchange
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

// Double Ratchet
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

// Key Storage
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

// Session Management
export {
  type SessionStatus,
  type E2EESession,
  SessionManager,
  sessionManager,
} from "./session";

// File Encryption
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
  compress,
  decompress,
  encryptFileWithProgress,
  calculateCompressionRatio,
} from "./file-encryption";

// Compression
export {
  type CompressionAlgorithm,
  type CompressionResult,
  getAvailableCompression,
  compress,
  decompress,
  compressText,
  decompressToText,
  estimateCompressionRatio,
  shouldCompress,
  StreamingCompressor,
  StreamingDecompressor,
} from "./compression";

// Utility functions
export {
  sha256,
  sha256Hex,
  concatArrays,
  toBase64,
  fromBase64,
  randomBytes,
} from "./sha256";

export {
  hkdf,
  hkdfExtract,
  hkdfExpand,
  deriveMessageKeys,
} from "./hkdf";

/**
 * Quick start: Initialize E2EE for a user
 */
export async function initializeE2EE(): Promise<{
  identityKey: IdentityKeyPair;
  signedPreKey: any;
  oneTimePreKeys: any[];
  keyBundle: KeyBundle;
}> {
  // Generate identity key
  const identityKey = await generateKeyPair();
  
  // Generate signed pre-key
  const signedPreKey = await generateSignedPreKey(identityKey);
  
  // Generate one-time pre-keys
  const oneTimePreKeys = await generateOneTimePreKeys(100);
  
  // Create bundle
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

/**
 * Type definition for encrypted message payload
 */
export interface EncryptedPayload {
  version: number;          // Protocol version (1)
  senderId: string;         // Sender's user ID
  sessionId: string;        // Session ID
  encrypted: string;        // Base64-encoded encrypted message
  timestamp: number;        // Send timestamp
}

/**
 * Encrypt a message for a peer
 */
export async function encryptForPeer(
  message: string,
  peerId: string,
  sessionManager: SessionManager
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(message);
  
  const { ciphertext } = await sessionManager.encryptForPeer(peerId, plaintext);
  
  return {
    version: 1,
    senderId: sessionManager["myKeyId"],
    sessionId: "", // Will be filled by caller
    encrypted: toBase64(ciphertext),
    timestamp: Date.now(),
  };
}

/**
 * Decrypt a message from a peer
 */
export async function decryptFromPeer(
  payload: EncryptedPayload,
  sessionManager: SessionManager
): Promise<string> {
  const encrypted = fromBase64(payload.encrypted);
  const plaintext = await sessionManager.decryptFromPeer(payload.senderId, encrypted);
  
  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}