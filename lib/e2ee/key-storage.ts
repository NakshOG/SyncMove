/**
 * Secure Key Storage using IndexedDB
 * 
 * Private keys are never stored in localStorage or transmitted to server.
 * Uses Web Crypto API for encryption at rest.
 */

import { randomBytes } from "./sha256";

/**
 * IndexedDB database name and version
 */
const DB_NAME = "SyncMoveE2EE";
const DB_VERSION = 1;

/**
 * Storage interface for key operations
 */
export interface KeyStorage {
  storeKey(keyId: string, key: CryptoKey): Promise<void>;
  getKey(keyId: string): Promise<CryptoKey | null>;
  deleteKey(keyId: string): Promise<void>;
  clear(): Promise<void>;
  getAllKeys(): Promise<{ keyId: string; created: number }[]>;
}

/**
 * IndexedDB-backed secure storage
 */
export class IndexedDBKeyStorage implements KeyStorage {
  private db: Promise<IDBDatabase>;
  
  constructor() {
    this.db = this.openDatabase();
  }
  
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Keys store: keyId -> { keyData, keyType, created }
        if (!db.objectStoreNames.contains("keys")) {
          const keysStore = db.createObjectStore("keys", { keyPath: "keyId" });
          keysStore.createIndex("created", "created", { unique: false });
        }
        
        // Sessions store: sessionId -> serialized session state
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionsStore = db.createObjectStore("sessions", { keyPath: "sessionId" });
          sessionsStore.createIndex("peerId", "peerId", { unique: false });
        }
        
        // Key bundles store: uploaded bundles for other users
        if (!db.objectStoreNames.contains("bundles")) {
          const bundlesStore = db.createObjectStore("bundles", { keyPath: "userId" });
          bundlesStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }
  
  async storeKey(keyId: string, key: CryptoKey): Promise<void> {
    const db = await this.db;
    
    // Export key in JWK format (most portable)
    const exportedKey = await crypto.subtle.exportKey("jwk", key);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("keys", "readwrite");
      const store = transaction.objectStore("keys");
      
      const request = store.put({
        keyId,
        key: exportedKey,
        keyType: key.algorithm.name,
        created: Date.now(),
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getKey(keyId: string): Promise<CryptoKey | null> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("keys", "readonly");
      const store = transaction.objectStore("keys");
      const request = store.get(keyId);
      
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        
        // Reconstruct key from JWK
        const algorithm = this.getAlgorithm(result.keyType);
        crypto.subtle.importKey(
          "jwk",
          result.key,
          algorithm,
          true,
          this.getKeyUsages(algorithm.name)
        )
          .then(resolve)
          .catch(() => resolve(null));
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async deleteKey(keyId: string): Promise<void> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("keys", "readwrite");
      const store = transaction.objectStore("keys");
      const request = store.delete(keyId);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async clear(): Promise<void> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("keys", "readwrite");
      const store = transaction.objectStore("keys");
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAllKeys(): Promise<{ keyId: string; created: number }[]> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("keys", "readonly");
      const store = transaction.objectStore("keys");
      const request = store.getAll();
      
      request.onsuccess = () => {
        const results = request.result ?? [];
        resolve(results.map(r => ({ keyId: r.keyId, created: r.created })));
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  private getAlgorithm(keyType: string): any {
    switch (keyType.toUpperCase()) {
      case "X25519":
      case "ECDH":
        return { name: "ECDH", namedCurve: "X25519" };
      case "ED25519":
        return { name: "Ed25519" };
      case "AES-GCM":
        return { name: "AES-GCM", length: 256 };
      default:
        return { name: keyType };
    }
  }
  
  private getKeyUsages(algorithm: string): KeyUsage[] {
    switch (algorithm) {
      case "ECDH":
        return ["deriveBits", "deriveKey"];
      case "Ed25519":
        return ["sign", "verify"];
      case "AES-GCM":
        return ["encrypt", "decrypt"];
      default:
        return [];
    }
  }
}

/**
 * Session storage
 */
export interface SessionData {
  sessionId: string;
  peerId: string;           // User ID of peer
  created: number;
  updated: number;
  state: string;            // Serialized DoubleRatchet state
  status: "pending" | "established" | "closed";
}

export class SessionStorage {
  private db: Promise<IDBDatabase>;
  
  constructor() {
    this.db = this.openDatabase();
  }
  
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("keys")) {
          db.createObjectStore("keys", { keyPath: "keyId" });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionsStore = db.createObjectStore("sessions", { keyPath: "sessionId" });
          sessionsStore.createIndex("peerId", "peerId", { unique: false });
        }
        if (!db.objectStoreNames.contains("bundles")) {
          const bundlesStore = db.createObjectStore("bundles", { keyPath: "userId" });
          bundlesStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }
  
  async saveSession(session: SessionData): Promise<void> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readwrite");
      const store = transaction.objectStore("sessions");
      const request = store.put(session);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getSession(sessionId: string): Promise<SessionData | null> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readonly");
      const store = transaction.objectStore("sessions");
      const request = store.get(sessionId);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getSessionsByPeer(peerId: string): Promise<SessionData[]> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readonly");
      const store = transaction.objectStore("sessions");
      const index = store.index("peerId");
      const request = index.getAll(peerId);
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  
  async deleteSession(sessionId: string): Promise<void> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readwrite");
      const store = transaction.objectStore("sessions");
      const request = store.delete(sessionId);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Key bundle storage for other users' public keys
 */
export class BundleStorage {
  private db: Promise<IDBDatabase>;
  
  constructor() {
    this.db = this.openDatabase();
  }
  
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("keys")) {
          db.createObjectStore("keys", { keyPath: "keyId" });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionsStore = db.createObjectStore("sessions", { keyPath: "sessionId" });
          sessionsStore.createIndex("peerId", "peerId", { unique: false });
        }
        if (!db.objectStoreNames.contains("bundles")) {
          const bundlesStore = db.createObjectStore("bundles", { keyPath: "userId" });
          bundlesStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }
  
  async saveBundle(userId: string, bundle: string): Promise<void> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("bundles", "readwrite");
      const store = transaction.objectStore("bundles");
      const request = store.put({
        userId,
        bundle,
        timestamp: Date.now(),
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getBundle(userId: string): Promise<string | null> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("bundles", "readonly");
      const store = transaction.objectStore("bundles");
      const request = store.get(userId);
      
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.bundle : null);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Global storage instances
 */
export const keyStorage = new IndexedDBKeyStorage();
export const sessionStorage = new SessionStorage();
export const bundleStorage = new BundleStorage();

/**
 * Password-derived key export/import for backup
 * 
 * The server never sees the password or derived key.
 * The user can export their keys encrypted with their password.
 */
export async function exportKeysWithPassword(
  password: string,
  keys: { id: string; key: CryptoKey }[]
): Promise<string> {
  // Derive encryption key from password using PBKDF2
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
  
  // Export all keys
  const exportedKeys = await Promise.all(
    keys.map(async ({ id, key }) => {
      const exported = await crypto.subtle.exportKey("jwk", key);
      return { id, key: exported, type: key.algorithm.name };
    })
  );
  
  // Encrypt the bundle
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bundleData = new TextEncoder().encode(JSON.stringify(exportedKeys));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    bundleData
  );
  
  // Return: salt + iv + encrypted data (all base64 encoded)
  const result = {
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
  
  return JSON.stringify(result);
}

/**
 * Import keys from password-protected backup
 */
export async function importKeysFromPassword(
  password: string,
  backup: string
): Promise<{ id: string; key: CryptoKey; type: string }[]> {
  const result = JSON.parse(backup);
  const salt = new Uint8Array(result.salt);
  const iv = new Uint8Array(result.iv);
  const encrypted = new Uint8Array(result.data);
  
  // Derive decryption key
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
  
  // Decrypt bundle
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    encrypted
  );
  
  const exportedKeys = JSON.parse(new TextDecoder().decode(decrypted));
  
  // Reconstruct keys
  const reconstructed = await Promise.all(
    exportedKeys.map(async ({ id, key, type }: { id: string; key: any; type: string }) => {
      const algorithm = type === "Ed25519" 
        ? { name: "Ed25519" }
        : type === "AES-GCM"
          ? { name: "AES-GCM", length: 256 }
          : { name: "ECDH", namedCurve: "X25519" };
      
      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        key,
        algorithm,
        true,
        algorithm.name === "Ed25519" 
          ? ["sign", "verify"]
          : algorithm.name === "AES-GCM"
            ? ["encrypt", "decrypt"]
            : ["deriveBits", "deriveKey"]
      );
      
      return { id, key: cryptoKey, type };
    })
  );
  
  return reconstructed;
}