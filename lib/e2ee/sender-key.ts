/**
 * Sender Key Implementation for Group Encryption
 * 
 * Efficient group messaging where each member has one sender key
 * that encrypts messages for all other members.
 * 
 * Instead of encrypting each message N times (once per recipient),
 * each sender has ONE key that encrypts messages once.
 * Recipients store sender keys from all other members.
 */

import { hkdf } from "./hkdf";
import { sha256, concatArrays, randomBytes } from "./sha256";
import { x3dhInitiator, IdentityKeyPair } from "./x3dh";

/**
 * Sender Key Pair
 */
export interface SenderKeyPair {
  keyId: string;
  chainKey: Uint8Array;   // For deriving message keys
  signatureKey: Uint8Array; // For message authentication
  created: number;
}

/**
 * Encrypted Sender Key (for distribution)
 */
export interface EncryptedSenderKey {
  senderKeyId: string;
  encryptedKey: Uint8Array;  // Sender key encrypted with recipient's session
  iv: Uint8Array;
}

/**
 * Sender Key Message
 */
export interface SenderKeyMessage {
  senderId: string;
  senderKeyId: string;
  messageNumber: number;
  previousChainLength: number;
  ciphertext: Uint8Array;   // Message encrypted with sender key
  mac: Uint8Array;
}

/**
 * Group Sender State
 */
export interface GroupSenderState {
  groupId: string;
  mySenderKey: SenderKeyPair | null;
  receivedSenderKeys: Map<string, SenderKeyPair>; // senderId -> SenderKey
  messageCounters: Map<string, number>; // senderId -> message number
}

/**
 * Generate a new Sender Key
 */
export async function generateSenderKey(): Promise<SenderKeyPair> {
  // Generate random chain key (32 bytes)
  const chainKey = randomBytes(32);
  
  // Generate signature key (Ed25519)
  const signatureKeyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );
  
  const signatureKey = await crypto.subtle.exportKey("raw", signatureKeyPair.publicKey);
  
  return {
    keyId: crypto.randomUUID(),
    chainKey,
    signatureKey,
    created: Date.now(),
  };
}

/**
 * Derive message key from chain key (Ratchet)
 */
async function deriveMessageKey(
  chainKey: Uint8Array
): Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }> {
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
 * Encrypt a message with Sender Key
 */
export async function encryptWithSenderKey(
  senderKey: SenderKeyPair,
  messageNumber: number,
  plaintext: Uint8Array
): Promise<SenderKeyMessage> {
  // Derive message key from chain key
  const { messageKey, nextChainKey } = await deriveMessageKey(senderKey.chainKey);
  
  // Update sender key's chain key
  senderKey.chainKey = nextChainKey;
  
  // Encrypt with AES-GCM
  const iv = randomBytes(12);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    messageKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  
  const header = serializeHeader(senderKey.keyId, messageNumber, 0);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    concatArrays(header, plaintext)
  );
  
  // Extract MAC (last 16 bytes for AES-GCM)
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const mac = encryptedBytes.slice(encryptedBytes.length - 16);
  
  return {
    senderId: "", // Set by caller
    senderKeyId: senderKey.keyId,
    messageNumber,
    previousChainLength: 0,
    ciphertext,
    mac,
  };
}

/**
 * Decrypt a Sender Key Message
 */
export async function decryptWithSenderKey(
  senderKey: SenderKeyPair,
  message: SenderKeyMessage,
  senderId: string
): Promise<Uint8Array> {
  // Derive message key (we need to ratchet through the chain)
  let currentChainKey = senderKey.chainKey;
  
  for (let i = 0; i < message.messageNumber; i++) {
    const { nextChainKey } = await deriveMessageKey(currentChainKey);
    currentChainKey = nextChainKey;
  }
  
  // Derive message key for this message
  const { messageKey } = await deriveMessageKey(currentChainKey);
  
  // Update sender key's chain key
  senderKey.chainKey = currentChainKey;
  
  // Decrypt
  const header = serializeHeader(senderKey.keyId, message.messageNumber, message.previousChainLength);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    messageKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  
  const encryptedData = concatArrays(message.ciphertext, message.mac);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(12) },
    cryptoKey,
    concatArrays(header, encryptedData)
  );
  
  // Remove header from decrypted
  const decryptedBytes = new Uint8Array(decrypted);
  return decryptedBytes.slice(header.length);
}

/**
 * Distribute Sender Key to a group member
 * 
 * Encrypts the sender key with the recipient's session key
 */
export async function distributeSenderKey(
  senderKey: SenderKeyPair,
  recipientIdentityKey: Uint8Array, // Peer's identity public key
  senderIdentityKey: IdentityKeyPair
): Promise<EncryptedSenderKey> {
  // Perform X3DH to derive shared secret
  // For simplicity, we'll use ECDH directly
  
  const ephemeralKey = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "X25519" },
    true,
    ["deriveBits"]
  );
  
  const recipientKey = await crypto.subtle.importKey(
    "raw",
    recipientIdentityKey,
    { name: "ECDH", namedCurve: "X25519" },
    false,
    []
  );
  
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    ephemeralKey.privateKey,
    256
  );
  
  // Derive encryption key from shared secret
  const derived = await hkdf(
    new Uint8Array(sharedBits),
    null,
    new TextEncoder().encode("SyncMoveSenderKey"),
    32
  );
  
  // Export sender key
  const keyData = serializeSenderKey(senderKey);
  
  // Encrypt with derived key
  const iv = randomBytes(12);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    derived,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    keyData
  );
  
  return {
    senderKeyId: senderKey.keyId,
    encryptedKey: new Uint8Array(encrypted),
    iv,
  };
}

/**
 * Receive and decrypt a Sender Key from another member
 */
export async function receiveSenderKey(
  encryptedKey: EncryptedSenderKey,
  myIdentityKey: IdentityKeyPair, // My identity private key
  senderEphemeralPublic: Uint8Array // Ephemeral public key from sender
): Promise<SenderKeyPair> {
  // Derive shared secret using ECDH
  const privateKey = await crypto.subtle.importKey(
    "raw",
    myIdentityKey.privateKey,
    { name: "ECDH", namedCurve: "X25519" },
    false,
    ["deriveBits"]
  );
  
  const publicKey = await crypto.subtle.importKey(
    "raw",
    senderEphemeralPublic,
    { name: "ECDH", namedCurve: "X25519" },
    false,
    []
  );
  
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  
  // Derive encryption key
  const derived = await hkdf(
    new Uint8Array(sharedBits),
    null,
    new TextEncoder().encode("SyncMoveSenderKey"),
    32
  );
  
  // Decrypt
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    derived,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encryptedKey.iv },
    cryptoKey,
    encryptedKey.encryptedKey
  );
  
  return deserializeSenderKey(new Uint8Array(decrypted));
}

/**
 * Serialize Sender Key for storage/transmission
 */
function serializeSenderKey(key: SenderKeyPair): Uint8Array {
  const data = new Uint8Array(32 + 32 + 32 + 8 + 8); // chainKey + signatureKey + keyId (UUID) + timestamp
  const encoder = new TextEncoder();
  
  let offset = 0;
  data.set(key.chainKey, offset);
  offset += 32;
  
  data.set(key.signatureKey, offset);
  offset += 32;
  
  const keyIdBytes = encoder.encode(key.keyId);
  const keyIdLength = new Uint8Array(8);
  const view = new DataView(keyIdLength.buffer);
  view.setBigUint64(0, BigInt(keyIdBytes.length), false);
  data.set(keyIdLength, offset);
  offset += 8;
  
  data.set(keyIdBytes, offset);
  offset += keyIdBytes.length;
  
  const timestampBytes = new Uint8Array(8);
  const tsView = new DataView(timestampBytes.buffer);
  tsView.setBigUint64(0, BigInt(key.created), false);
  data.set(timestampBytes, offset);
  
  return data;
}

/**
 * Deserialize Sender Key
 */
function deserializeSenderKey(data: Uint8Array): SenderKeyPair {
  const decoder = new TextDecoder();
  
  let offset = 0;
  const chainKey = data.slice(0, 32);
  offset += 32;
  
  const signatureKey = data.slice(32, 64);
  offset += 32;
  
  const keyIdLength = new BigUint64Array(data.slice(offset, offset + 8).buffer);
  offset += 8;
  
  const keyIdBytes = data.slice(offset, offset + Number(keyIdLength[0]));
  offset += Number(keyIdLength[0]);
  
  const createdBytes = new BigUint64Array(data.slice(offset, offset + 8).buffer);
  
  return {
    keyId: decoder.decode(keyIdBytes),
    chainKey,
    signatureKey,
    created: Number(createdBytes[0]),
  };
}

/**
 * Serialize message header
 */
function serializeHeader(keyId: string, messageNumber: number, previousChainLength: number): Uint8Array {
  const encoder = new TextEncoder();
  const keyIdBytes = encoder.encode(keyId);
  
  const header = new Uint8Array(8 + 4 + 4 + keyIdBytes.length);
  const view = new DataView(header.buffer);
  
  view.setBigUint64(0, BigInt(messageNumber), false);
  view.setUint32(8, previousChainLength, false);
  view.setUint32(12, keyIdBytes.length, false);
  
  header.set(keyIdBytes, 16);
  
  return header;
}

/**
 * Group Sender State Manager
 */
export class GroupSenderManager {
  private groups: Map<string, GroupSenderState> = new Map();
  
  /**
   * Create or join a group
   */
  createGroup(groupId: string): GroupSenderState {
    const state: GroupSenderState = {
      groupId,
      mySenderKey: null,
      receivedSenderKeys: new Map(),
      messageCounters: new Map(),
    };
    
    this.groups.set(groupId, state);
    return state;
  }
  
  /**
   * Get group state
   */
  getGroup(groupId: string): GroupSenderState | undefined {
    return this.groups.get(groupId);
  }
  
  /**
   * Generate and set my sender key for a group
   */
  async setMySenderKey(groupId: string): Promise<SenderKeyPair> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }
    
    const senderKey = await generateSenderKey();
    group.mySenderKey = senderKey;
    return senderKey;
  }
  
  /**
   * Add a sender key from another member
   */
  addReceivedSenderKey(groupId: string, senderId: string, key: SenderKeyPair): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    
    group.receivedSenderKeys.set(senderId, key);
    group.messageCounters.set(senderId, 0);
  }
  
  /**
   * Encrypt a message for the group
   */
  async encryptForGroup(
    groupId: string,
    plaintext: Uint8Array
  ): Promise<SenderKeyMessage | null> {
    const group = this.groups.get(groupId);
    if (!group || !group.mySenderKey) {
      return null;
    }
    
    const counter = group.messageCounters.get("self") ?? 0;
    group.messageCounters.set("self", counter + 1);
    
    const message = await encryptWithSenderKey(
      group.mySenderKey,
      counter,
      plaintext
    );
    
    message.senderId = "self";
    return message;
  }
  
  /**
   * Decrypt a message from a group member
   */
  async decryptFromGroup(
    groupId: string,
    senderId: string,
    message: SenderKeyMessage
  ): Promise<Uint8Array | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;
    
    const senderKey = group.receivedSenderKeys.get(senderId);
    if (!senderKey) return null;
    
    return await decryptWithSenderKey(senderKey, message, senderId);
  }
  
  /**
   * Remove a member's sender key (when they leave)
   */
  removeMember(groupId: string, senderId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    
    group.receivedSenderKeys.delete(senderId);
    group.messageCounters.delete(senderId);
  }
}

/**
 * Global group sender manager
 */
export const groupSenderManager = new GroupSenderManager();

/**
 * Serialize EncryptedSenderKey for transmission
 */
export function serializeEncryptedSenderKey(
  key: EncryptedSenderKey
): string {
  return JSON.stringify({
    senderKeyId: key.senderKeyId,
    encryptedKey: Array.from(key.encryptedKey),
    iv: Array.from(key.iv),
  });
}

/**
 * Deserialize EncryptedSenderKey
 */
export function deserializeEncryptedSenderKey(
  data: string
): EncryptedSenderKey {
  const parsed = JSON.parse(data);
  return {
    senderKeyId: parsed.senderKeyId,
    encryptedKey: new Uint8Array(parsed.encryptedKey),
    iv: new Uint8Array(parsed.iv),
  };
}

/**
 * Serialize SenderKeyMessage for transmission
 */
export function serializeSenderKeyMessage(
  message: SenderKeyMessage
): string {
  return JSON.stringify({
    senderId: message.senderId,
    senderKeyId: message.senderKeyId,
    messageNumber: message.messageNumber,
    previousChainLength: message.previousChainLength,
    ciphertext: Array.from(message.ciphertext),
    mac: Array.from(message.mac),
  });
}

/**
 * Deserialize SenderKeyMessage
 */
export function deserializeSenderKeyMessage(
  data: string
): SenderKeyMessage {
  const parsed = JSON.parse(data);
  return {
    senderId: parsed.senderId,
    senderKeyId: parsed.senderKeyId,
    messageNumber: parsed.messageNumber,
    previousChainLength: parsed.previousChainLength,
    ciphertext: new Uint8Array(parsed.ciphertext),
    mac: new Uint8Array(parsed.mac),
  };
}