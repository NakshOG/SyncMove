/**
 * HKDF (HMAC-based Key Derivation Function) Implementation
 * 
 * Uses HMAC-SHA256 for key derivation per RFC 5869
 */

import { sha256 } from "./sha256";

/**
 * HKDF-SHA256 Extract
 * 
 * @param ikm - Input key material
 * @param salt - Optional salt (should be random but can be empty)
 * @returns PRK (pseudorandom key)
 */
export async function hkdfExtract(
  ikm: Uint8Array,
  salt?: Uint8Array
): Promise<Uint8Array> {
  const saltToUse = salt && salt.length > 0 
    ? salt 
    : new Uint8Array(32); // Zero salt if not provided
  
  // HMAC-Hash(salt, IKM)
  const key = await crypto.subtle.importKey(
    "raw",
    saltToUse,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const prk = await crypto.subtle.sign("HMAC", key, ikm);
  return new Uint8Array(prk);
}

/**
 * HKDF-SHA256 Expand
 * 
 * @param prk - Pseudorandom key from extract
 * @param info - Context and application specific info
 * @param length - Desired output length in bytes
 * @returns Derived key material
 */
export async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // Ensure length doesn't exceed 255 * hash_length (255 * 32 = 8160 bytes for SHA-256)
  if (length > 8160) {
    throw new Error("HKDF expand length too large");
  }
  
  const hashLength = 32; // SHA-256 output size
  const numBlocks = Math.ceil(length / hashLength);
  
  const output = new Uint8Array(length);
  const previousOutput = new Uint8Array(hashLength);
  
  const prkKey = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  let t = new Uint8Array(0);
  
  for (let i = 1; i <= numBlocks; i++) {
    // T(i) = HMAC-Hash(PRK, T(i-1) || info || i)
    const input = new Uint8Array(t.length + info.length + 1);
    input.set(t, 0);
    input.set(info, t.length);
    input[t.length + info.length] = i;
    
    t = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, input));
    previousOutput.set(t, 0);
    
    const bytesToCopy = Math.min(hashLength, length - (i - 1) * hashLength);
    output.set(t.slice(0, bytesToCopy), (i - 1) * hashLength);
  }
  
  return output;
}

/**
 * HKDF-SHA256 (Extract + Expand combined)
 * 
 * @param ikm - Input key material
 * @param salt - Optional salt
 * @param info - Optional context info
 * @param length - Desired output length in bytes
 * @returns Derived key material
 */
export async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array | null,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const saltToUse = salt ?? undefined;
  const infoToUse = info ?? new Uint8Array(0);
  
  const prk = await hkdfExtract(ikm, saltToUse);
  return await hkdfExpand(prk, infoToUse, length);
}

/**
 * Derive separate keys from master secret
 * 
 * @param masterSecret - 64-byte secret from X3DH
 * @returns Object with rootKey and messageKeyChain
 */
export async function deriveMessageKeys(
  masterSecret: Uint8Array
): Promise<{ rootKey: Uint8Array; messageKeyChain: Uint8Array }> {
  if (masterSecret.length < 64) {
    throw new Error("Master secret must be 64 bytes");
  }
  
  return {
    rootKey: masterSecret.slice(0, 32),
    messageKeyChain: masterSecret.slice(32, 64),
  };
}