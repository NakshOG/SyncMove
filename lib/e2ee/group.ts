import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "./hkdf";
import { fromBase64, randomBytes, toBase64 } from "./sha256";

const GROUP_VERSION = 2;
const GROUP_INFO = new TextEncoder().encode("SyncMoveGroupMessageV2");

export interface GroupRecipient {
  userId: string;
  identityKey: Uint8Array;
}

interface GroupEntry {
  userId: string;
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
}

export interface GroupEnvelope {
  v: number;
  type: "group";
  senderId: string;
  encrypted: GroupEntry[];
}

function aad(userId: string, ephemeralPublicKey: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    `${GROUP_VERSION}|${userId}|${toBase64(ephemeralPublicKey)}`,
  );
}

async function deriveKey(
  sharedSecret: Uint8Array,
  userId: string,
  ephemeralPublicKey: Uint8Array,
): Promise<CryptoKey> {
  const keyBytes = await hkdf(
    sharedSecret,
    null,
    new Uint8Array([...GROUP_INFO, ...new TextEncoder().encode(`|${userId}|${toBase64(ephemeralPublicKey)}`)]),
    32,
  );
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptGroupMessage(
  senderId: string,
  plaintext: string,
  recipients: GroupRecipient[],
): Promise<string> {
  const ephemeral = x25519.keygen();
  const ephemeralPublicKey = new Uint8Array(ephemeral.publicKey);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const encrypted: GroupEntry[] = [];

  for (const recipient of recipients) {
    if (recipient.identityKey.length !== 32) continue;
    const sharedSecret = new Uint8Array(
      x25519.getSharedSecret(ephemeral.secretKey, recipient.identityKey),
    );
    const key = await deriveKey(sharedSecret, recipient.userId, ephemeralPublicKey);
    const iv = randomBytes(12);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad(recipient.userId, ephemeralPublicKey) },
        key,
        plaintextBytes,
      ),
    );
    encrypted.push({
      userId: recipient.userId,
      ephemeralPublicKey: toBase64(ephemeralPublicKey),
      iv: toBase64(iv),
      ciphertext: toBase64(ciphertext),
    });
  }

  if (encrypted.length === 0) throw new Error("No valid group encryption recipients");
  return JSON.stringify({ v: GROUP_VERSION, type: "group", senderId, encrypted } satisfies GroupEnvelope);
}

export async function decryptGroupMessage(
  serialized: string,
  recipientId: string,
  identityPrivateKey: Uint8Array,
): Promise<string | null> {
  let envelope: GroupEnvelope;
  try {
    envelope = JSON.parse(serialized) as GroupEnvelope;
  } catch {
    return null;
  }
  if (envelope.v !== GROUP_VERSION || envelope.type !== "group") return null;

  const entry = envelope.encrypted.find((item) => item.userId === recipientId);
  if (!entry) return null;

  try {
    const ephemeralPublicKey = fromBase64(entry.ephemeralPublicKey);
    const sharedSecret = new Uint8Array(
      x25519.getSharedSecret(identityPrivateKey, ephemeralPublicKey),
    );
    const key = await deriveKey(sharedSecret, recipientId, ephemeralPublicKey);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(entry.iv), additionalData: aad(recipientId, ephemeralPublicKey) },
      key,
      fromBase64(entry.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
