# SyncMove - Development TODO

> **Architecture Reference**: See `papers/ZeroKnowledgeE2EEArchitecture.md` for E2EE design based on Signal Protocol.

## 1. BUG FIXES: Video/Audio Transfer Issues

### 1.1 WebRTC Issues
- [ ] **ICE Candidate Race Condition**: `pendingCandidates` stored by socketId but signal handler uses `fromId` - potential mismatch
- [ ] **Missing DTLS-SRTP**: WebRTC peer connection doesn't enforce encrypted transport
- [ ] **No STUN/TURN fallback**: Only uses public Google STUN, no TURN for NAT traversal
- [ ] **Signaling channel vulnerability**: Offer/answer/candidate data transmitted in plain text via Socket.IO

### 1.2 Socket Issues
- [ ] **No socket-level authentication**: Auth enforced by data APIs, not socket handshake
- [ ] **Missing heartbeat/ping-pong**: No client-server keepalive mechanism
- [ ] **Reconnection race conditions**: Multiple connection attempts possible

### 1.3 Call Flow Issues
- [ ] **Race in peer creation**: `createPeer` checks `peers.current.has()` but doesn't handle concurrent calls
- [ ] **No call timeout handling**: Stuck in "waiting" state if peer never joins
- [ ] **AudioContext not resumed properly**: Browser autoplay policies may block audio

## 2. ZERO-KNOWLEDGE E2EE (Signal Protocol)

> **Reference**: `papers/ZeroKnowledgeE2EEArchitecture.md`  
> **Based on**: Signal Protocol (https://signal.org/docs/)

### 2.1 Phase 1: Core E2EE Infrastructure ✅
- [x] **lib/e2ee/x3dh.ts** - X3DH key exchange implementation
  - Identity Key Pair generation (X25519)
  - Signed Pre-Key (SPK) with Ed25519 signature
  - One-Time Pre-Keys (OPKs) batch generation
  - Shared secret derivation (HKDF-SHA256)
- [x] **lib/e2ee/double-ratchet.ts** - Double Ratchet algorithm
  - Root chain ratcheting (HKDF)
  - Message chain ratcheting (AES-GCM)
  - Diffie-Hellman ratchet on each message
  - Skipped message handling (max skip: 1000)
- [x] **lib/e2ee/key-storage.ts** - Key storage and session management
  - IndexedDB-backed secure key storage
  - Session storage with serialization
  - Bundle storage for peer keys
  - Password-derived backup/export
- [x] **lib/e2ee/session.ts** - Session management
  - Session state machine (pending → established → closed)
  - Peer session cache
  - Incoming message decryption queue
  - Outgoing message encryption queue
- [x] **lib/e2ee/file-encryption.ts** - File encryption (compress then encrypt)
- [x] **lib/e2ee/compression.ts** - Client-side compression utilities
- [x] **lib/e2ee/hkdf.ts** - HKDF-SHA256 implementation
- [x] **lib/e2ee/sha256.ts** - SHA-256 and utility functions
- [x] **lib/e2ee/index.ts** - Main exports and quick-start functions

### 2.2 Phase 2: Messaging Integration
- [ ] **Update Message type** - Add encrypted content field
  - Prisma schema: `Message.encryptedContent`
  - Client: Store ciphertext + IV
- [ ] **Encrypt before send** - Hook into chat-input
  ```typescript
  // Before API call:
  const ciphertext = await encryptMessage(session, content);
  await fetch('/api/messages', {
    body: JSON.stringify({ channelId, content: ciphertext })
  });
  ```
- [ ] **Decrypt on receive** - Hook into chat-messages
  ```typescript
  // On socket message:
  const plaintext = await decryptMessage(session, message.encryptedContent);
  render(plaintext);
  ```
- [ ] **Key Bundle API** - Endpoints for key exchange
  - `GET /api/keys/:userId` - Download peer's bundle
  - `POST /api/keys` - Upload own bundle
  - `DELETE /api/keys/:keyId` - Revoke compromised keys
- [ ] **Pre-key Storage in Prisma**
  - Add `KeyBundle` model
  - Store: userId, ik, spk, spkSignature, opks[]
  - One-time use, delete after retrieval

### 2.3 Phase 3: Group Encryption (Sender Keys)
- [ ] **Sender Key Distribution**
  - Each member generates sender key
  - Encrypted to each recipient's session key
  - Re-encrypted on member join/leave
- [ ] **Group Message Encryption**
  - Encrypt with sender key
  - No per-recipient encryption overhead
- [ ] **Group Key Rotation**
  - Triggered on: member join, member leave, periodic
  - New sender key distributed to remaining members

### 2.4 Phase 4: File Encryption (Compress Then Encrypt)
> **Approach**: Client-side compression → AES-GCM encryption → Upload encrypted blob
- [ ] **lib/e2ee/file-encryption.ts**
  ```typescript
  async function encryptFile(file: File): Promise<EncryptedFile> {
    // 1. Compress with CompressionStream API
    const compressed = await compress(file.stream());
    
    // 2. Generate random key (256-bit) + IV (96-bit)
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 }, true, ["encrypt"]
    );
    
    // 3. Encrypt compressed data
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, compressed
    );
    
    // 4. Export key (encrypted with recipient's session key)
    const encryptedKey = await encryptKeyForRecipients(key, recipients);
    
    return { ciphertext, iv, encryptedKey, metadata };
  }
  ```
- [ ] **lib/e2ee/compression.ts**
  - `CompressionStream` API (native browser)
  - Fallback: pako/zlib for broader support
  - Target: 50-70% reduction for text/media

### 2.5 Phase 5: WebRTC Media Encryption
- [ ] **DTLS-SRTP enforcement** - Mandatory
  ```typescript
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    // FORCE DTLS
    certificates: [await createTLSCertificate()],
  });
  pc.setConfiguration({
    ...pc.getConfiguration(),
    // Explicitly require encrypted transport
    iceTransportPolicy: "all",
  });
  // Ensure SRTP is negotiated
  ```
- [ ] **SRTP key negotiation** - WebRTC default, verify enabled
- [ ] **Certificate pinning** (optional) - Verify DTLS fingerprints
- [ ] **TURN servers** - Add for NAT traversal
  ```typescript
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:your-turn-server.com:3478",
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    },
  ];
  ```

### 2.6 Key Management & Storage
- [ ] **IndexedDB key storage** - Never localStorage
  ```typescript
  // lib/e2ee/key-storage.ts
  class SecureKeyStorage {
    private db: Promise<IDBDatabase>;
    
    async storeKey(keyId: string, key: CryptoKey): Promise<void> {
      const exported = await crypto.subtle.exportKey("jwk", key);
      await this.db.then(db => 
        db.transaction("keys", "readwrite").objectStore("keys")
          .put({ keyId, key: exported, created: Date.now() })
      );
    }
    
    async getKey(keyId: string): Promise<CryptoKey | null> {
      const stored = await this.db.then(db =>
        db.transaction("keys").objectStore("keys").get(keyId)
      );
      if (!stored) return null;
      return await crypto.subtle.importKey(
        "jwk", stored.key, { name: "X25519" }, true, ["deriveBits"]
      );
    }
  }
  ```
- [ ] **Password-derived backup** - Export encrypted with KDF
- [ ] **Key rotation schedule**
  - Identity Key: Manual (rarely needed)
  - Signed Pre-Key: Rotate weekly
  - One-Time Pre-Keys: Replenish when < 20 remaining
- [ ] **Compromise recovery**
  - Device reset → Generate new keys
  - Server query → Invalidate old sessions
  - Notify peers → Re-establish sessions

## 3. REMOVE MOBILE-RELATED CODE

### 3.1 Navigation
- [ ] Delete `components/navigation/mobile-navigation.tsx`
- [ ] Remove `md:hidden` classes throughout codebase
- [ ] Simplify layout to single sidebar approach

### 3.2 Responsive Design
- [ ] Remove `md:flex` conditional layouts
- [ ] Remove mobile-specific padding (`pb-16`, `sm:px-6`)
- [ ] Use fixed desktop-first breakpoints
- [ ] Remove `100dvh` dynamic viewport handling

### 3.3 Components to Simplify
- [ ] `app/(main)/(routes)/layout.tsx` - Remove mobile layout
- [ ] `app/(main)/(routes)/servers/[serverID]/layout.tsx` - Remove mobile sidebar
- [ ] Any mobile-specific CSS utilities

## 4. PROFESSIONAL IMPROVEMENTS

### 4.1 Authentication & Security
- [ ] **Socket-level auth**: Validate Clerk session on socket handshake
- [ ] **Rate limiting**: Add per-user rate limits on socket events
- [ ] **Input validation**: Sanitize all message content on server
- [ ] **XSS prevention**: Content Security Policy headers

### 4.2 Error Handling & Logging
- [ ] **Centralized error boundary**: Wrap components with error boundaries
- [ ] **Structured logging**: JSON logs with request IDs
- [ ] **Client-side error reporting**: Send errors to server for monitoring
- [ ] **Fallback UI**: Graceful degradation when WebRTC fails

### 4.3 Performance
- [ ] **Lazy load call components**: Only load WebRTC when user joins call
- [ ] **Optimistic updates**: Instant message display before server confirmation
- [ ] **Message pagination**: Improve infinite scroll performance
- [ ] **Socket event batching**: Batch multiple events in single packet

### 4.4 Call Quality
- [ ] **Adaptive bitrate**: Adjust quality based on bandwidth
- [ ] **Bandwidth probing**: Initial quality estimation
- [ ] **Codec negotiation**: Explicit VP8/VP9/H.264 preference
- [ ] **Connection quality indicator**: Show ping/latency to peers

## 5. DEPENDENCY ADDITIONS
- [ ] `@whisper/encrypted-messaging` or implement Double Ratchet manually
- `ffmpeg-wasm` for client-side compression (optional)
- `@types/ws` if using raw WebSocket (not Socket.IO)

## 6. TESTING
- [ ] Unit tests for encryption utilities
- [ ] Integration tests for WebRTC call flow
- [ ] E2E tests for message sending/receiving
- [ ] Performance tests for large file transfers

---

## Notes

### Priority Order
1. **P0 - Critical Bugs**: ICE candidate issues, DTLS enforcement
2. **P1 - Security**: Basic E2EE for messages
3. **P2 - UX**: Remove mobile code, improve error handling
4. **P3 - Polish**: Performance, testing, advanced features

### Implementation Approach
- Encryption should be **opt-in per server/channel** initially
- Backward compatible - plain text for legacy clients
- Key exchange during message send, not fetch
- Progressive disclosure of encryption features

### Estimated Complexity
- Basic E2EE: ~2-3 weeks
- Group encryption: ~1-2 weeks  
- File encryption: ~1 week
- Mobile removal: ~2-3 days
- Bug fixes: ~1 week