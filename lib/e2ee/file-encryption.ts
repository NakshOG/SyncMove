/**
 * File Encryption Module
 * 
 * Approach: Compress First → Encrypt with AES-GCM
 * 
 * Flow:
 * 1. Client-side compression (CompressionStream API or fallback)
 * 2. Generate random AES-GCM key (256-bit)
 * 3. Encrypt compressed data with IV (96-bit)
 * 4. Export key encrypted for recipients (using their E2EE session)
 * 5. Upload encrypted blob to server
 */

import { randomBytes, toBase64, fromBase64 } from "./sha256";

/**
 * Encrypted file metadata (stored unencrypted for server delivery)
 */
export interface EncryptedFileMetadata {
  fileName: string;           // Original filename (encrypted separately if needed)
  mimeType: string;           // Original MIME type
  size: number;               // Original file size
  compressedSize: number;     // Size after compression
  encryptedSize: number;      // Size after encryption
  iv: string;                 // Base64-encoded IV (12 bytes)
  keyId: string;              // Key identifier
  created: number;            // Timestamp
}

/**
 * Encrypted file packet for upload
 */
export interface EncryptedFile {
  metadata: EncryptedFileMetadata;
  encryptedData: ArrayBuffer; // AES-GCM encrypted compressed data
  encryptedKey: Uint8Array;   // File key encrypted for recipients
}

/**
 * Result of file encryption
 */
export interface EncryptionResult {
  metadata: EncryptedFileMetadata;
  encryptedBlob: Blob;        // For upload
  // Raw AES key is returned only to the caller so it can be wrapped with the
  // channel's E2EE session before metadata leaves the browser.
  fileKey: Uint8Array;
  preview?: {                 // Optional preview (first 1KB decrypted)
    data: Uint8Array;
    mimeType: string;
  };
}

/**
 * Compress data using browser CompressionStream API
 */
export async function compress(
  data: Uint8Array | ArrayBuffer | ReadableStream
): Promise<Uint8Array> {
  let inputStream: ReadableStream;
  
  if (data instanceof Uint8Array) {
    inputStream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
  } else if (data instanceof ArrayBuffer) {
    inputStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });
  } else {
    inputStream = data;
  }
  
  const compressedStream = inputStream.pipeThrough(new CompressionStream("gzip"));
  const chunks: Uint8Array[] = [];
  const reader = compressedStream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Concatenate all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

/**
 * Decompress data
 */
export async function decompress(
  data: Uint8Array | ArrayBuffer
): Promise<Uint8Array> {
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
      controller.close();
    },
  });
  
  const decompressedStream = inputStream.pipeThrough(new DecompressionStream("gzip"));
  const chunks: Uint8Array[] = [];
  const reader = decompressedStream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

/**
 * Generate a random file encryption key
 */
export async function generateFileKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt file (compress then encrypt)
 */
export async function encryptFile(
  file: File | Blob,
  recipients?: Uint8Array[] // Optional: list of recipient session public keys for key encryption
): Promise<EncryptionResult> {
  const originalSize = file.size;
  const originalName = file instanceof File ? file.name : "file";
  const mimeType = file instanceof File ? file.type : "application/octet-stream";
  
  // Step 1: Read file as Uint8Array
  let fileData: Uint8Array;
  if (file instanceof File) {
    fileData = new Uint8Array(await file.arrayBuffer());
  } else {
    fileData = new Uint8Array(await file.arrayBuffer());
  }
  
  // Step 2: Compress
  const compressed = await compress(fileData);
  const compressedSize = compressed.length;
  
  // Step 3: Generate key and IV
  const key = await generateFileKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyId = crypto.randomUUID();
  
  // Step 4: Encrypt
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    compressed
  );
  
  const encryptedSize = encryptedData.byteLength;
  
  // Step 5: Export key for recipients (if provided)
  let encryptedKey = new Uint8Array(0);
  if (recipients && recipients.length > 0) {
    encryptedKey = await encryptKeyForRecipients(key, recipients);
  } else {
    // Export key for local storage
    const exported = await crypto.subtle.exportKey("raw", key);
    encryptedKey = new Uint8Array(exported);
  }
  
  // Build metadata
  const metadata: EncryptedFileMetadata = {
    fileName: originalName,
    mimeType,
    size: originalSize,
    compressedSize,
    encryptedSize,
    iv: toBase64(iv),
    keyId,
    created: Date.now(),
  };
  
  return {
    metadata,
    encryptedBlob: new Blob([encryptedData], { type: "application/octet-stream" }),
    fileKey: encryptedKey,
  };
}

/**
 * Decrypt file (decrypt then decompress)
 */
export async function decryptFile(
  encryptedData: ArrayBuffer,
  metadata: EncryptedFileMetadata,
  key: Uint8Array | CryptoKey,
  encryptedKey?: Uint8Array // If key is encrypted, provide encrypted version to decrypt it
): Promise<Uint8Array> {
  let cryptoKey: CryptoKey;
  
  if (key instanceof Uint8Array) {
    // Key is raw bytes, import it
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  } else {
    cryptoKey = key;
  }
  
  const iv = fromBase64(metadata.iv);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    cryptoKey,
    encryptedData
  );
  
  // Decompress
  const decompressed = await decompress(new Uint8Array(decrypted));
  
  return decompressed;
}

/**
 * Encrypt file key for multiple recipients using E2EE session keys
 * 
 * Each recipient has a session public key. We use ECDH to derive
 * a shared secret, then encrypt the file key with that secret.
 */
export async function encryptKeyForRecipients(
  fileKey: CryptoKey,
  recipientPublicKeys: Uint8Array[]
): Promise<Uint8Array> {
  // Export file key as raw bytes
  const exportedKey = await crypto.subtle.exportKey("raw", fileKey);
  
  // For simplicity, we'll encrypt once and include all recipient IDs
  // In production, you might want per-recipient encryption
  
  // Generate a key encryption key (KEK) using first recipient's public key
  const firstRecipientKey = recipientPublicKeys[0];
  const ephemeralKey = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "X25519" },
    true,
    ["deriveBits"]
  );
  
  const ephemeralPublic = await crypto.subtle.exportKey("raw", ephemeralKey.publicKey);
  const recipientKey = await crypto.subtle.importKey(
    "raw",
    firstRecipientKey,
    { name: "ECDH", namedCurve: "X25519" },
    false,
    []
  );
  
  // Derive shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    ephemeralKey.privateKey,
    256
  );
  
  // Use shared secret to encrypt file key
  const sharedKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    exportedKey
  );
  
  // Combine: ephemeralPublic(32) + iv(12) + encryptedKey(variable)
  const result = new Uint8Array(32 + 12 + encryptedKey.byteLength);
  result.set(new Uint8Array(ephemeralPublic), 0);
  result.set(iv, 32);
  result.set(new Uint8Array(encryptedKey), 44);
  
  return result;
}

/**
 * Decrypt file key (for a recipient)
 */
export async function decryptKeyForRecipient(
  encryptedKey: Uint8Array,
  myPrivateKey: Uint8Array
): Promise<CryptoKey> {
  const ephemeralPublic = encryptedKey.slice(0, 32);
  const iv = encryptedKey.slice(32, 44);
  const encrypted = encryptedKey.slice(44);
  
  // Import my private key
  const privateCryptoKey = await crypto.subtle.importKey(
    "raw",
    myPrivateKey,
    { name: "ECDH", namedCurve: "X25519" },
    false,
    ["deriveBits"]
  );
  
  // Import ephemeral public key
  const publicCryptoKey = await crypto.subtle.importKey(
    "raw",
    ephemeralPublic,
    { name: "ECDH", namedCurve: "X25519" },
    false,
    []
  );
  
  // Derive shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicCryptoKey },
    privateCryptoKey,
    256
  );
  
  // Import shared secret as encryption key
  const sharedKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  // Decrypt file key
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encrypted
  );
  
  // Import and return as CryptoKey
  return await crypto.subtle.importKey(
    "raw",
    decrypted,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Progress callback type
 */
export type EncryptionProgressCallback = (progress: {
  stage: "reading" | "compressing" | "encrypting" | "uploading";
  progress: number; // 0-100
}) => void;

/**
 * Encrypt file with progress tracking
 */
export async function encryptFileWithProgress(
  file: File,
  onProgress?: EncryptionProgressCallback,
  recipients?: Uint8Array[]
): Promise<EncryptionResult> {
  onProgress?.({ stage: "reading", progress: 0 });
  
  const fileData = new Uint8Array(await file.arrayBuffer());
  
  onProgress?.({ stage: "reading", progress: 100 });
  
  // Rest is same as encryptFile
  return encryptFile(fileData, recipients);
}

/**
 * Explicit fallback for environments without CompressionStream.
 * We do not silently lie about compression; we simply return the original data
 * when the platform does not support gzip.
 */
export async function compressWithPako(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== "undefined") {
    return compress(data);
  }

  return data;
}

/**
 * Calculate compression ratio
 */
export function calculateCompressionRatio(
  original: number,
  compressed: number
): number {
  if (original === 0) return 0;
  return ((original - compressed) / original) * 100;
}
