/**
 * Session Management for E2EE Conversations
 * 
 * Handles session establishment, state management, and message queuing.
 */

import {
  x3dhInitiator,
  x3dhResponder,
  IdentityKeyPair,
  KeyBundle,
  InitialMessage,
  X3DHResult,
} from "./x3dh";
import {
  createInitialState,
  encryptMessage,
  decryptMessage,
  serializeState,
  deserializeState,
  DoubleRatchetState,
  EncryptedMessage,
  MessageHeader,
} from "./double-ratchet";
import { sessionStorage, keyStorage, bundleStorage } from "./key-storage";
import { randomBytes } from "./sha256";

/**
 * Session status
 */
export type SessionStatus = "pending" | "established" | "closed";

/**
 * Session interface
 */
export interface E2EESession {
  sessionId: string;
  peerId: string;           // User ID of conversation peer
  peerIdentityKey: Uint8Array; // Peer's identity public key
  status: SessionStatus;
  created: number;
  updated: number;
  lastMessageNr: number;
  
  // Internal state (not persisted directly)
  state?: DoubleRatchetState;
}

/**
 * Outgoing message queue for offline peers
 */
interface QueuedMessage {
  content: Uint8Array;
  timestamp: number;
  attempts: number;
  maxAttempts: number;
}

/**
 * Session Manager class
 */
export class SessionManager {
  private myIdentityKey: IdentityKeyPair | null = null;
  private myKeyId: string = "";
  private messageQueue: Map<string, QueuedMessage[]> = new Map();
  private maxQueueAttempts: number = 10;
  
  /**
   * Initialize with user's identity key
   */
  async initialize(identityKey: IdentityKeyPair, keyId: string): Promise<void> {
    this.myIdentityKey = identityKey;
    this.myKeyId = keyId;
    
    // Try to restore existing sessions
    await this.restoreSessions();
  }
  
  /**
   * Create a new session with a peer
   */
  async createSession(
    peerId: string,
    peerBundle: KeyBundle
  ): Promise<E2EESession> {
    if (!this.myIdentityKey) {
      throw new Error("SessionManager not initialized");
    }
    
    // Check for existing session
    const existing = await sessionStorage.getSessionsByPeer(peerId);
    const activeSession = existing.find(s => s.status !== "closed");
    if (activeSession) {
      return this.loadSessionState(activeSession);
    }
    
    // Perform X3DH key exchange (initiator side)
    const { result, initialMessage } = await x3dhInitiator(
      this.myIdentityKey,
      peerBundle
    );
    
    // Create session state
    const state = createInitialState(
      result.sharedSecret.slice(0, 32), // rootKey (32 bytes)
      this.myIdentityKey.privateKey,    // localEphemeralPrivate
      this.myIdentityKey.publicKey,     // localEphemeralPublic
      peerBundle.identityKey           // remoteEphemeralPublic
    );
    
    const session: E2EESession = {
      sessionId: crypto.randomUUID(),
      peerId,
      peerIdentityKey: peerBundle.identityKey,
      status: "pending",
      created: Date.now(),
      updated: Date.now(),
      lastMessageNr: 0,
      state,
    };
    
    // Save session
    await this.saveSession(session);
    
    // TODO: Send initial message to peer with the X3DH result
    // This will complete the handshake
    
    return session;
  }
  
  /**
   * Complete session establishment (responder side)
   */
  async completeSession(
    peerId: string,
    initialMessage: InitialMessage,
    theirIdentityKey: Uint8Array
  ): Promise<E2EESession> {
    if (!this.myIdentityKey) {
      throw new Error("SessionManager not initialized");
    }
    
    // Check for existing session
    const existing = await sessionStorage.getSessionsByPeer(peerId);
    const activeSession = existing.find(s => s.status !== "closed");
    if (activeSession) {
      return this.loadSessionState(activeSession);
    }
    
    // Perform X3DH key exchange (responder side)
    // Note: In real implementation, you'd load SPK and OTPK from storage
    const spk = await this.loadMySignedPreKey();
    const opk = await this.loadMyOneTimePreKey();
    
    const result = await x3dhResponder(
      this.myIdentityKey,
      spk,
      opk,
      initialMessage.senderIdentityKey,
      initialMessage.ephemeralKey,
      initialMessage.usedOneTimePreKeyId
    );
    
    // Create session state
    const state = createInitialState(
      result.sharedSecret.slice(0, 32),
      this.myIdentityKey.privateKey,
      initialMessage.ephemeralKey, // Our ephemeral becomes the remote's perspective
      initialMessage.senderIdentityKey
    );
    
    const session: E2EESession = {
      sessionId: crypto.randomUUID(),
      peerId,
      peerIdentityKey: initialMessage.senderIdentityKey,
      status: "established",
      created: Date.now(),
      updated: Date.now(),
      lastMessageNr: 0,
      state,
    };
    
    await this.saveSession(session);
    
    return session;
  }
  
  /**
   * Encrypt a message for a peer
   */
  async encryptForPeer(
    peerId: string,
    plaintext: Uint8Array
  ): Promise<{ ciphertext: Uint8Array; sessionId: string }> {
    const sessions = await sessionStorage.getSessionsByPeer(peerId);
    const session = sessions.find(s => s.status === "established");
    
    if (!session) {
      throw new Error(`No established session with ${peerId}`);
    }
    
    const sessionData = await this.loadSessionState(session);
    
    if (!sessionData.state) {
      throw new Error("Session state not available");
    }
    
    const encrypted = await encryptMessage(sessionData.state, plaintext);
    const ciphertext = this.serializeEncryptedMessage(encrypted);
    
    return { ciphertext, sessionId: session.sessionId };
  }
  
  /**
   * Decrypt a message from a peer
   */
  async decryptFromPeer(
    peerId: string,
    encrypted: Uint8Array
  ): Promise<Uint8Array> {
    const sessions = await sessionStorage.getSessionsByPeer(peerId);
    const session = sessions.find(s => s.status !== "closed");
    
    if (!session) {
      throw new Error(`No session with ${peerId}`);
    }
    
    const sessionData = await this.loadSessionState(session);
    
    if (!sessionData.state) {
      throw new Error("Session state not available");
    }
    
    const message = this.deserializeEncryptedMessage(encrypted);
    return await decryptMessage(sessionData.state, message);
  }
  
  /**
   * Close a session
   */
  async closeSession(peerId: string): Promise<void> {
    const sessions = await sessionStorage.getSessionsByPeer(peerId);
    
    for (const session of sessions) {
      await sessionStorage.deleteSession(session.sessionId);
    }
    
    // Clear message queue
    this.messageQueue.delete(peerId);
  }
  
  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<E2EESession[]> {
    const sessions = await sessionStorage.getSessionsByPeer(this.myKeyId);
    return Promise.all(
      sessions.filter(s => s.status !== "closed").map(s => this.loadSessionState(s))
    );
  }
  
  /**
   * Queue message for offline peer
   */
  queueMessage(peerId: string, content: Uint8Array): void {
    const queue = this.messageQueue.get(peerId) || [];
    queue.push({
      content,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: this.maxQueueAttempts,
    });
    this.messageQueue.set(peerId, queue);
  }
  
  /**
   * Process queued messages for a peer
   */
  async processQueuedMessages(peerId: string): Promise<void> {
    const queue = this.messageQueue.get(peerId);
    if (!queue || queue.length === 0) return;
    
    const sessions = await sessionStorage.getSessionsByPeer(peerId);
    if (sessions.length === 0 || sessions.every(s => s.status !== "established")) {
      return; // No established session yet
    }
    
    const remaining: QueuedMessage[] = [];
    
    for (const msg of queue) {
      msg.attempts++;
      
      try {
        await this.encryptForPeer(peerId, msg.content);
        // Message sent successfully, don't requeue
      } catch {
        if (msg.attempts < msg.maxAttempts) {
          remaining.push(msg);
        }
      }
    }
    
    if (remaining.length > 0) {
      this.messageQueue.set(peerId, remaining);
    } else {
      this.messageQueue.delete(peerId);
    }
  }
  
  /**
   * Save session to storage
   */
  private async saveSession(session: E2EESession): Promise<void> {
    await sessionStorage.saveSession({
      sessionId: session.sessionId,
      peerId: session.peerId,
      created: session.created,
      updated: session.updated,
      state: session.state ? serializeState(session.state) : "",
      status: session.status,
    });
  }
  
  /**
   * Load and deserialize session state
   */
  private async loadSessionState(storageSession: {
    sessionId: string;
    peerId: string;
    created: number;
    updated: number;
    state: string;
    status: SessionStatus;
  }): Promise<E2EESession> {
    const state = storageSession.state 
      ? deserializeState(storageSession.state) 
      : undefined;
    
    // Get peer's identity key from bundle storage
    const bundleJson = await bundleStorage.getBundle(storageSession.peerId);
    let peerIdentityKey: Uint8Array;
    
    if (bundleJson) {
      const bundle = JSON.parse(bundleJson);
      peerIdentityKey = new Uint8Array(bundle.ik);
    } else {
      // Use the identity key stored in session state
      peerIdentityKey = state?.dhRemotePublic || new Uint8Array(32);
    }
    
    return {
      sessionId: storageSession.sessionId,
      peerId: storageSession.peerId,
      peerIdentityKey,
      status: storageSession.status,
      created: storageSession.created,
      updated: storageSession.updated,
      lastMessageNr: 0,
      state,
    };
  }
  
  /**
   * Restore all sessions from storage
   */
  private async restoreSessions(): Promise<void> {
    // Load all sessions and restore their state
    // This is called on initialization
  }
  
  /**
   * Load user's signed pre-key (for responder)
   */
  private async loadMySignedPreKey(): Promise<any> {
    // In real implementation, load from IndexedDB
    // For now, return placeholder
    return null;
  }
  
  /**
   * Load user's one-time pre-key (for responder)
   */
  private async loadMyOneTimePreKey(): Promise<any> {
    // In real implementation, load from IndexedDB
    // For now, return placeholder
    return null;
  }
  
  /**
   * Serialize encrypted message for transport
   */
  private serializeEncryptedMessage(msg: EncryptedMessage): Uint8Array {
    const headerBytes = this.serializeHeader(msg.header);
    const combined = new Uint8Array(
      headerBytes.length + msg.ciphertext.length + msg.mac.length
    );
    combined.set(headerBytes, 0);
    combined.set(msg.ciphertext, headerBytes.length);
    combined.set(msg.mac, headerBytes.length + msg.ciphertext.length);
    return combined;
  }
  
  /**
   * Deserialize encrypted message from transport
   */
  private deserializeEncryptedMessage(data: Uint8Array): EncryptedMessage {
    const header = this.deserializeHeader(data.slice(0, 40));
    const headerEnd = 40;
    const ciphertextEnd = data.length - 16;
    
    return {
      header,
      ciphertext: data.slice(headerEnd, ciphertextEnd),
      mac: data.slice(ciphertextEnd),
    };
  }
  
  /**
   * Serialize message header
   */
  private serializeHeader(header: MessageHeader): Uint8Array {
    const bytes = new Uint8Array(40);
    bytes.set(header.dhPublicKey, 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(32, header.pn, false);
    view.setUint32(36, header.mesgNr, false);
    return bytes;
  }
  
  /**
   * Deserialize message header
   */
  private deserializeHeader(bytes: Uint8Array): MessageHeader {
    const view = new DataView(bytes.buffer);
    return {
      dhPublicKey: bytes.slice(0, 32),
      pn: view.getUint32(32, false),
      mesgNr: view.getUint32(36, false),
    };
  }
}

/**
 * Global session manager instance
 */
export const sessionManager = new SessionManager();