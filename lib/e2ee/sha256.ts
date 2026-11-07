/**
 * SHA-256 Hashing Utility
 */

/**
 * Compute SHA-256 hash
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Compute SHA-256 hash (returns as hex string)
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await sha256(data);
  return Array.from(hash)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatArrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  
  return result;
}

/**
 * Convert Uint8Array to Base64 string
 */
export function toBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Convert ArrayBuffer to Uint8Array
 */
export function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

/**
 * Convert Uint8Array to ArrayBuffer
 */
export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer;
}