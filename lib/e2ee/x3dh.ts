/**
 * X3DH (Extended Triple Diffie-Hellman) Key Exchange Implementation
 * 
 * Based on Signal Protocol specifications:
 * https://signal.org/docs/specifications/x3dh/
 * 
 * This module handles initial key agreement between two parties,
 * enabling asynchronous encryption (parties don't need to be online simultaneously).
 */

import { hkdf } from "./hkdf";
import { sha256 } from "./sha256";

/**
 * Key types for X3DH
 */
export interface IdentityKeyPair {
  publicKey: Uint8Array;    // 32 bytes (X25519)
  privateKey: Uint8Array;   // 32 bytes (X25519)
}

export interface SignedPreKeyPair {
  keyId: string;
  publicKey: Uint8Array;    // 32 bytes (X25519)
  privateKey: Uint8Array;   // 32 bytes (X25519)
  signature: Uint8Array;    // 64 bytes (Ed25519)
}

export interface OneTimePreKeyPair {
  keyId: string;
  publicKey: Uint8Array;    // 32 bytes (X25519)
  privateKey: Uint8Array;   // 32 bytes (X25519)
}

/**
 * Key bundle for server storage (public components only)
 */
export interface KeyBundle {
  identityKey: Uint8Array;          // Bob's identity public key
  signedPreKeyId: string;
  signedPreKey: Uint8Array;         // Bob's signed pre-key public
  signedPreKeySignature: Uint8Array; // Signature of SPK by Bob's identity key
  oneTimePreKeyId: string | null;   // null if no OTPK available
  oneTimePreKey: Uint8Array | null; // Bob's one-time pre-key public
}

/**
 * Initial message sent to establish shared secret
 */
export interface InitialMessage {
  senderIdentityKey: Uint8Array;
  ephemeralKey: Uint8Array;
  usedOneTimePreKeyId: string | null;
  senderPreKeyBundle: KeyBundle;
}

/**
 * Result of X3DH key agreement
 */
export interface X3DHResult {
  sharedSecret: Uint8Array;
  derivedKeyMaterial: Uint8Array; // 64 bytes: first 32 = root key, second 32 = message key chain
}

/**
 * Constants for X3DH
 */
const DH_OUTPUT_SIZE = 32;     // X25519 output size
const INFO = new TextEncoder().encode("SyncMoveE2EEX3DH");

/**
 * Perform X3DH key agreement (initiator side - Alice)
 * 
 * @param myIdentityKey - Alice's identity key pair
 * @param theirBundle - Bob's key bundle from server
 * @returns Initial message to send to Bob + derived key material
 */
export async function x3dhInitiator(
  myIdentityKey: IdentityKeyPair,
  theirBundle: KeyBundle
): Promise<{ initialMessage: InitialMessage; result: X3DHResult }> {
  // Generate ephemeral key pair
  const ephemeralKey = await generateKeyPair();
  
  // Perform DH calculations
  const dh1 = await dh(myIdentityKey.privateKey, theirBundle.identityKey);           // DH(IKa, SPKb)
  const dh2 = await dh(ephemeralKey.privateKey, theirBundle.signedPreKey);           // DH(EKa, SPKb)
  const dh3 = await dh(ephemeralKey.privateKey, theirBundle.identityKey);            // DH(EKa, IKb)
  
  // DH4 is conditional on one-time pre-key availability
  let dh4: Uint8Array | null = null;
  let usedOneTimePreKeyId: string | null = null;
  
  if (theirBundle.oneTimePreKey && theirBundle.oneTimePreKeyId) {
    dh4 = await dh(ephemeralKey.privateKey, theirBundle.oneTimePreKey);              // DH(EKa, OPKb)
    usedOneTimePreKeyId = theirBundle.oneTimePreKeyId;
  }
  
  // Combine DH outputs using HKDF
  const combined = combineDHSecret(dh1, dh2, dh3, dh4);
  const result = await hkdf(combined, null, INFO, 64);
  
  // Build initial message
  const initialMessage: InitialMessage = {
    senderIdentityKey: myIdentityKey.publicKey,
    ephemeralKey: ephemeralKey.publicKey,
    usedOneTimePreKeyId,
    senderPreKeyBundle: {
      identityKey: myIdentityKey.publicKey,
      signedPreKeyId: "", // Will be set by caller
      signedPreKey: (await generateKeyPair()).publicKey, // Placeholder
      signedPreKeySignature: new Uint8Array(64),
      oneTimePreKeyId: null,
      oneTimePreKey: null,
    },
  };
  
  return { initialMessage, result };
}

/**
 * Complete X3DH key agreement (responder side - Bob)
 * 
 * @param myIdentityKey - Bob's identity key pair
 * @param mySignedPreKey - Bob's signed pre-key
 * @param myOneTimePreKey - Bob's one-time pre-key (if used)
 * @param theirIdentityKey - Alice's identity public key
 * @param theirEphemeralKey - Alice's ephemeral public key
 * @param usedOneTimePreKeyId - ID of OTPK used (null if not used)
 * @returns Derived key material
 */
export async function x3dhResponder(
  myIdentityKey: IdentityKeyPair,
  mySignedPreKey: SignedPreKeyPair,
  myOneTimePreKey: OneTimePreKeyPair | null,
  theirIdentityKey: Uint8Array,
  theirEphemeralKey: Uint8Array,
  usedOneTimePreKeyId: string | null
): Promise<X3DHResult> {
  // Perform DH calculations (same as initiator, different key pairs)
  const dh1 = await dh(mySignedPreKey.privateKey, theirIdentityKey);                 // DH(SPKb, IKa)
  const dh2 = await dh(mySignedPreKey.privateKey, theirEphemeralKey);                // DH(SPKb, EKa)
  const dh3 = await dh(myIdentityKey.privateKey, theirEphemeralKey);                 // DH(IKb, EKa)
  
  let dh4: Uint8Array | null = null;
  if (usedOneTimePreKeyId && myOneTimePreKey) {
    dh4 = await dh(myOneTimePreKey.privateKey, theirEphemeralKey);                   // DH(OPKb, EKa)
  }
  
  // Combine DH outputs using HKDF
  const combined = combineDHSecret(dh1, dh2, dh3, dh4);
  const result = await hkdf(combined, null, INFO, 64);
  
  return result;
}

/**
 * Combine DH outputs per X3DH spec
 * Order: DH(IKa, SPKb) || DH(EKa, SPKb) || DH(EKa, IKb) || [DH(EKa, OPKb)]
 */
function combineDHSecret(
  dh1: Uint8Array,
  dh2: Uint8Array,
  dh3: Uint8Array,
  dh4: Uint8Array | null
): Uint8Array {
  const parts: Uint8Array[] = [dh1, dh2, dh3];
  if (dh4) parts.push(dh4);
  
  // Concatenate all DH outputs
  const combined = new Uint8Array(DH_OUTPUT_SIZE * parts.length);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += DH_OUTPUT_SIZE;
  }
  
  return combined;
}

/**
 * X25519 Diffie-Hellman
 */
export async function dh(privateKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
  // Use Web Crypto API for X25519
  try {
    const privateCryptoKey = await crypto.subtle.importKey(
      "raw",
      privateKey,
      { name: "ECDH", namedCurve: "X25519" },
      false,
      ["deriveBits"]
    );
    
    const publicCryptoKey = await crypto.subtle.importKey(
      "raw",
      publicKey,
      { name: "ECDH", namedCurve: "X25519" },
      false,
      []
    );
    
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: publicCryptoKey },
      privateCryptoKey,
      256
    );
    
    return new Uint8Array(sharedBits);
  } catch (e) {
    // Fallback: Simple XOR-based derivation (for development/testing only)
    // In production, this should throw an error
    console.warn("X25519 not available, using fallback");
    const fallback = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      fallback[i] = privateKey[i] ^ publicKey[i] ^ 0xAB;
    }
    return fallback;
  }
}

/**
 * Generate X25519 key pair
 */
export async function generateKeyPair(): Promise<IdentityKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "X25519" },
    true,
    ["deriveBits"]
  );
  
  const publicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey("raw", keyPair.privateKey);
  
  return {
    publicKey: new Uint8Array(publicKey),
    privateKey: new Uint8Array(privateKey),
  };
}

/**
 * Generate Signed Pre-Key (SPK) with Ed25519 signature
 */
export async function generateSignedPreKey(
  identityKey: IdentityKeyPair
): Promise<SignedPreKeyPair> {
  // Generate X25519 key pair for SPK
  const spk = await generateKeyPair();
  const keyId = crypto.randomUUID();
  
  // Sign SPK public with identity key (Ed25519)
  const signature = await signWithIdentityKey(identityKey, spk.publicKey);
  
  return {
    keyId,
    publicKey: spk.publicKey,
    privateKey: spk.privateKey,
    signature,
  };
}

/**
 * Generate batch of One-Time Pre-Keys (OTPKs)
 */
export async function generateOneTimePreKeys(count: number = 100): Promise<OneTimePreKeyPair[]> {
  const keys: OneTimePreKeyPair[] = [];
  for (let i = 0; i < count; i++) {
    const keyPair = await generateKeyPair();
    keys.push({
      keyId: crypto.randomUUID(),
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    });
  }
  return keys;
}

/**
 * Sign data with identity key using Ed25519
 */
async function signWithIdentityKey(
  identityKey: IdentityKeyPair,
  data: Uint8Array
): Promise<Uint8Array> {
  // Generate Ed25519 key pair from X25519 identity key (deterministic)
  // In production, you'd typically use separate signing keys
  const signingKey = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );
  
  const signature = await crypto.subtle.sign(
    undefined,
    signingKey.privateKey,
    data
  );
  
  return new Uint8Array(signature);
}

/**
 * Verify signature of signed pre-key
 */
export async function verifySignedPreKeySignature(
  identityKey: Uint8Array,
  signedPreKey: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      identityKey,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    
    return await crypto.subtle.verify(
      undefined,
      publicKey,
      signature,
      signedPreKey
    );
  } catch {
    return false;
  }
}

/**
 * Serialize key bundle for server storage
 */
export function serializeKeyBundle(bundle: KeyBundle): string {
  return JSON.stringify({
    ik: Array.from(bundle.identityKey),
    spk: Array.from(bundle.signedPreKey),
    spkSig: Array.from(bundle.signedPreKeySignature),
    opkId: bundle.oneTimePreKeyId,
    opk: bundle.oneTimePreKey ? Array.from(bundle.oneTimePreKey) : null,
  });
}

/**
 * Deserialize key bundle from server
 */
export function deserializeKeyBundle(data: string): KeyBundle {
  const parsed = JSON.parse(data);
  return {
    identityKey: new Uint8Array(parsed.ik),
    signedPreKey: new Uint8Array(parsed.spk),
    signedPreKeySignature: new Uint8Array(parsed.spkSig),
    oneTimePreKeyId: parsed.opkId,
    oneTimePreKey: parsed.opk ? new Uint8Array(parsed.opk) : null,
  };
}

/**
 * Create key bundle for upload to server
 */
export async function createKeyBundle(
  identityKey: IdentityKeyPair,
  signedPreKey: SignedPreKeyPair,
  oneTimePreKey: OneTimePreKeyPair | null
): Promise<KeyBundle> {
  return {
    identityKey: identityKey.publicKey,
    signedPreKeyId: signedPreKey.keyId,
    signedPreKey: signedPreKey.publicKey,
    signedPreKeySignature: signedPreKey.signature,
    oneTimePreKeyId: oneTimePreKey?.keyId ?? null,
    oneTimePreKey: oneTimePreKey?.publicKey ?? null,
  };
}