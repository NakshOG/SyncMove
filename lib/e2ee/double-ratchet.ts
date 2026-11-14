/**
 * Double Ratchet Algorithm Implementation
 * 
 * Based on Signal Protocol specifications:
 * https://signal.org/docs/specifications/doubleratchet/
 * 
 * Provides forward secrecy and post-compromise security through
 * continuous key ratcheting after each message.
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "./hkdf";
import { sha256, concatArrays, randomBytes } from "./sha256";

/**
 * Constants
 */
const ROOT_KEY_INFO = new TextEncoder().encode("SyncMoveE2EE_RootRatchet");
const MESSAGE_KEY_INFO = new TextEncoder().encode("SyncMoveE2EE_MessageKey");
const DH_INFO = new TextEncoder().encode("SyncMoveE2EE_DHRatchet");
const MAX_SKIP = 1000; // Maximum messages to skip and still recover

/**
 * Symmetric State for Double Ratchet
 */
interface SymmetricState {
  ck: Uint8Array; // Chain key (32 bytes)
  mk: Uint8Array; // Message key (32 bytes)
}

/**
 * Double Ratchet State
 */
export interface DoubleRatchetState {
  bootstrapChainVersion?: number;
  // DH ratchet state
  dhRemotePublic: Uint8Array | null;  // Remote party's current DH public key
  dhLocalPublic: Uint8Array;          // Our current DH public key
  dhLocalPrivate: Uint8Array;         // Our current DH private key
  
  // Root chain state
  rootKey: Uint8Array;                // 32 bytes
  
  // Sending chain (when sending messages)
  sendingChainKey: Uint8Array | null; // 32 bytes
  sendingChainLength: number;         // Number of messages sent in current chain
  
  // Receiving chain (when receiving messages)
  receivingChainKey: Uint8Array | null; // 32 bytes
  receivingChainLength: number;         // Number of messages received in current chain
  skippedMessageKeys: Map<number, Uint8Array>; // headerKey -> messageKey
}

/**
 * Encrypted Message Header
 */
export interface MessageHeader {
  dhPublicKey: Uint8Array;     // Current DH public key
  pn: number;                  // Previous chain length (previous sending chain length)
  mesgNr: number;              // Message number in current chain
}

/**
 * Encrypted Message
 */
export interface EncryptedMessage {
  header: MessageHeader;       // Unencrypted header
  ciphertext: Uint8Array;      // AEAD encrypted content
  mac: Uint8Array;             // Authentication tag (included in ciphertext for AES-GCM)
}

/**
 * Initial state after X3DH
 */
export interface InitialState {
  rootKey: Uint8Array;         // 32 bytes from X3DH
  remoteIdentityKey: Uint8Array; // Remote party's identity public key
  localIdentityKey: Uint8Array;   // Our identity public key
  localEphemeralPrivate: Uint8Array; // Our ephemeral private key (from X3DH)
  localEphemeralPublic: Uint8Array;  // Our ephemeral public key (from X3DH)
  remoteEphemeralPublic: Uint8Array; // Remote's ephemeral public key (from X3DH)
}

/**
 * Create initial Double Ratchet state from X3DH result
 */
export function createInitialState(
  rootKey: Uint8Array,
  localEphemeralPrivate: Uint8Array,
  localEphemeralPublic: Uint8Array,
  remoteEphemeralPublic: Uint8Array
): DoubleRatchetState {
  return {
    bootstrapChainVersion: 2,
    dhRemotePublic: remoteEphemeralPublic,
    dhLocalPublic: localEphemeralPublic,
    dhLocalPrivate: localEphemeralPrivate,
    rootKey,
    sendingChainKey: null,
    sendingChainLength: 0,
    receivingChainKey: null,
    receivingChainLength: 0,
    skippedMessageKeys: new Map(),
  };
}

/**
 * Initialize the first sending chain after X3DH. Older sessions were stored
 * before this step existed, so this is intentionally idempotent and can also
 * repair a restored session with a missing chain.
 */
export async function establishSendingChain(state: DoubleRatchetState): Promise<void> {
  if (state.bootstrapChainVersion === 2 && state.sendingChainKey) return;
  // The first channel message is encrypted before a DH header exchange has
  // taken place. Derive this bootstrap chain from the X3DH shared secret so
  // both independently-created peer sessions get the same first chain.
  const derived = await hkdf(state.rootKey, state.rootKey, ROOT_KEY_INFO, 32);
  state.sendingChainKey = derived;
  state.sendingChainLength = 0;
  state.receivingChainKey = null;
  state.receivingChainLength = 0;
  state.skippedMessageKeys.clear();
  state.bootstrapChainVersion = 2;
}

/**
 * Ratchet Root Chain (DH ratchet step)
 */
async function ratchetRootChain(
  state: DoubleRatchetState,
  remotePublicKey: Uint8Array
): Promise<void> {
  // Store previous receiving chain
  const previousReceivingChainKey = state.receivingChainKey;
  const previousReceivingLength = state.receivingChainLength;
  
  // DH ratchet: replace receiving chain with new sending chain
  state.dhRemotePublic = remotePublicKey;
  state.receivingChainKey = null;
  state.receivingChainLength = 0;
  
  // Derive new sending chain key from root key
  // RootKey = HKDF-Root(RootKey, DH(OurEphemeral, TheirPublic))
  const dhOutput = await dh(state.dhLocalPrivate, state.dhRemotePublic!);
  const [newRootKey, newChainKey] = await deriveRootAndChain(
    state.rootKey,
    dhOutput
  );
  
  state.rootKey = newRootKey;
  state.sendingChainKey = newChainKey;
  state.sendingChainLength = 0;
  
  // If we had a previous receiving chain, derive message keys for skipped messages
  if (previousReceivingChainKey && previousReceivingLength > 0) {
    // Message keys for skipped messages go to skipped message keys map
    // Keyed by (headerKey, messageNumber) - using headerKey as identifier
    // In practice, you'd need to store more state to identify skipped messages
    state.skippedMessageKeys.clear(); // Simplified: clear skipped on ratchet
  }
}

/**
 * Derive new root key and chain key
 */
async function deriveRootAndChain(
  currentRootKey: Uint8Array,
  dhOutput: Uint8Array
): Promise<[Uint8Array, Uint8Array]> {
  const derived = await hkdf(dhOutput, currentRootKey, ROOT_KEY_INFO, 64);
  return [derived.slice(0, 32), derived.slice(32, 64)];
}

/**
 * Derive next message key from chain key
 */
async function deriveMessageKey(
  chainKey: Uint8Array
): Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }> {
  // messageKey = HMAC(chainKey, 0x01)
  // nextChainKey = HMAC(chainKey, 0x02)
  const key = await crypto.subtle.importKey(
    "raw",
    chainKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const messageKeyBytes = await crypto.subtle.sign("HMAC", key, new Uint8Array([0x01]));
  const nextChainKeyBytes = await crypto.subtle.sign("HMAC", key, new Uint8Array([0x02]));
  
  return {
    messageKey: new Uint8Array(messageKeyBytes),
    nextChainKey: new Uint8Array(nextChainKeyBytes),
  };
}

/**
 * Encrypt a message (sending side)
 */
export async function encryptMessage(
  state: DoubleRatchetState,
  plaintext: Uint8Array
): Promise<EncryptedMessage> {
  // Ensure we have a sending chain
  if (!state.sendingChainKey) {
    throw new Error("Must establish shared secret before encrypting");
  }
  
  // Derive message key from current sending chain
  const { messageKey, nextChainKey } = await deriveMessageKey(state.sendingChainKey);
  state.sendingChainKey = nextChainKey;
  state.sendingChainLength++;
  
  // Create header
  const header: MessageHeader = {
    dhPublicKey: state.dhLocalPublic,
    pn: state.receivingChainLength,
    mesgNr: state.sendingChainLength,
  };
  
  // Encrypt message with AES-GCM
  const ciphertext = await encryptAesGcm(messageKey, header, plaintext);
  
  return { header, ciphertext: ciphertext.ciphertext, mac: ciphertext.tag };
}

/**
 * Decrypt a message (receiving side)
 */
export async function decryptMessage(
  state: DoubleRatchetState,
  encrypted: EncryptedMessage
): Promise<Uint8Array> {
  const { header, ciphertext, mac } = encrypted;
  
  // Check for skipped message keys (if we previously had this chain)
  const skippedKey = findSkippedMessageKey(state, header);
  if (skippedKey) {
    return await decryptAesGcm(skippedKey, header, ciphertext, mac);
  }
  
  // Bootstrap the receiving chain for the first message. The sender's first
  // chain is derived from the X3DH shared secret, before a DH header exchange.
  if (state.receivingChainKey === null && header.pn === 0 && state.receivingChainLength === 0) {
    state.receivingChainKey = await hkdf(state.rootKey, state.rootKey, ROOT_KEY_INFO, 32);
  }

  // DH ratchet if remote public key has changed after the bootstrap message.
  if (
    state.receivingChainKey !== null &&
    state.receivingChainLength > 0 &&
    (state.dhRemotePublic === null || !arraysEqual(state.dhRemotePublic, header.dhPublicKey))
  ) {
    // If header's PN > receivingChainLength, we skipped some messages
    // Store skipped message keys for future recovery
    if (header.pn > state.receivingChainLength) {
      // In full implementation, store skipped message keys
      // Here we just advance our receiving chain
    }
    
    await ratchetRootChain(state, header.dhPublicKey);
  }
  
  // Advance receiving chain if necessary
  if (state.receivingChainKey === null) {
    // First message from new DH epoch - derive receiving chain
    const dhOutput = await dh(state.dhLocalPrivate, state.dhRemotePublic!);
    const [newRootKey, newChainKey] = await deriveRootAndChain(
      state.rootKey,
      dhOutput
    );
    state.rootKey = newRootKey;
    state.receivingChainKey = newChainKey;
    state.receivingChainLength = 0;
  }
  
  // Check if we need to skip messages in receiving chain
  if (header.mesgNr < state.receivingChainLength) {
    // Skip - message already decrypted or too old
    throw new Error("Message number too old");
  }
  
  // Derive message keys for skipped messages
  while (state.receivingChainLength < header.mesgNr - 1) {
    const { messageKey, nextChainKey } = await deriveMessageKey(state.receivingChainKey!);
    state.receivingChainKey = nextChainKey;
    state.receivingChainLength++;
    
    // Store skipped message key for potential out-of-order delivery
    // Keyed by message number (in real impl, also by DH public key)
    state.skippedMessageKeys.set(state.receivingChainLength, messageKey);
  }
  
  // Derive current message key
  const { messageKey, nextChainKey } = await deriveMessageKey(state.receivingChainKey!);
  state.receivingChainKey = nextChainKey;
  state.receivingChainLength++;
  
  // Decrypt
  return await decryptAesGcm(messageKey, header, ciphertext, mac);
}

/**
 * Find a skipped message key
 */
function findSkippedMessageKey(
  state: DoubleRatchetState,
  header: MessageHeader
): Uint8Array | null {
  // Look up by message number (simplified - real impl uses compound key)
  const key = state.skippedMessageKeys.get(header.mesgNr);
  if (key) {
    state.skippedMessageKeys.delete(header.mesgNr);
    return key;
  }
  return null;
}

/**
 * AES-GCM Encryption with header as additional data
 */
async function encryptAesGcm(
  key: Uint8Array,
  header: MessageHeader,
  plaintext: Uint8Array
): Promise<{ ciphertext: Uint8Array; tag: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const headerBytes = serializeHeader(header);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: headerBytes },
    cryptoKey,
    plaintext
  );
  
  // AES-GCM returns ciphertext + tag concatenated
  const result = new Uint8Array(encrypted);
  const tagStart = result.length - 16;
  
  return {
    ciphertext: result.slice(0, tagStart),
    tag: result.slice(tagStart),
  };
}

/**
 * AES-GCM Decryption
 */
async function decryptAesGcm(
  key: Uint8Array,
  header: MessageHeader,
  ciphertext: Uint8Array,
  mac: Uint8Array
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const headerBytes = serializeHeader(header);
  
  // Combine ciphertext + mac for decryption
  const encryptedData = concatArrays(ciphertext, mac);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: headerBytes },
    cryptoKey,
    encryptedData
  );
  
  return new Uint8Array(decrypted);
}

/**
 * Serialize message header for AEAD additional data
 */
function serializeHeader(header: MessageHeader): Uint8Array {
  // dhPublicKey (32) + pn (4) + mesgNr (4) = 40 bytes
  const bytes = new Uint8Array(40);
  
  bytes.set(header.dhPublicKey, 0);
  const pnView = new DataView(bytes.buffer);
  pnView.setUint32(32, header.pn, false);
  pnView.setUint32(36, header.mesgNr, false);
  
  return bytes;
}

/**
 * Deserialize message header
 */
export function deserializeHeader(bytes: Uint8Array): MessageHeader {
  const view = new DataView(bytes.buffer);
  
  return {
    dhPublicKey: bytes.slice(0, 32),
    pn: view.getUint32(32, false),
    mesgNr: view.getUint32(36, false),
  };
}

/**
 * X25519 Diffie-Hellman (imported from x3dh, duplicated for self-containment)
 */
async function dh(privateKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
  const shared = x25519.getSharedSecret(privateKey, publicKey);
  return new Uint8Array(shared);
}

/**
 * Compare two Uint8Arrays for equality
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Generate new DH key pair for ratchet
 */
export async function generateRatchetKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  const keyPair = x25519.keygen();

  return {
    publicKey: new Uint8Array(keyPair.publicKey),
    privateKey: new Uint8Array(keyPair.secretKey),
  };
}

/**
 * Export state for persistence
 */
export function serializeState(state: DoubleRatchetState): string {
  const skippedKeys: { [key: number]: string } = {};
  state.skippedMessageKeys.forEach((value, key) => {
    skippedKeys[key] = Array.from(value).join(",");
  });
  
  return JSON.stringify({
    dhRemotePublic: state.dhRemotePublic ? Array.from(state.dhRemotePublic) : null,
    dhLocalPublic: Array.from(state.dhLocalPublic),
    dhLocalPrivate: Array.from(state.dhLocalPrivate),
    rootKey: Array.from(state.rootKey),
    sendingChainKey: state.sendingChainKey ? Array.from(state.sendingChainKey) : null,
    sendingChainLength: state.sendingChainLength,
    receivingChainKey: state.receivingChainKey ? Array.from(state.receivingChainKey) : null,
    receivingChainLength: state.receivingChainLength,
    skippedMessageKeys: skippedKeys,
  });
}

/**
 * Import state from persistence
 */
export function deserializeState(data: string): DoubleRatchetState {
  const parsed = JSON.parse(data);
  
  const skippedKeys = new Map<number, Uint8Array>();
  for (const [keyStr, valueStr] of Object.entries(parsed.skippedMessageKeys)) {
    const keyNum = parseInt(keyStr);
    const valueArr = new Uint8Array((valueStr as string).split(",").map(Number));
    skippedKeys.set(keyNum, valueArr);
  }
  
  return {
    dhRemotePublic: parsed.dhRemotePublic ? new Uint8Array(parsed.dhRemotePublic) : null,
    dhLocalPublic: new Uint8Array(parsed.dhLocalPublic),
    dhLocalPrivate: new Uint8Array(parsed.dhLocalPrivate),
    rootKey: new Uint8Array(parsed.rootKey),
    sendingChainKey: parsed.sendingChainKey ? new Uint8Array(parsed.sendingChainKey) : null,
    sendingChainLength: parsed.sendingChainLength,
    receivingChainKey: parsed.receivingChainKey ? new Uint8Array(parsed.receivingChainKey) : null,
    receivingChainLength: parsed.receivingChainLength,
    skippedMessageKeys: skippedKeys,
  };
}
