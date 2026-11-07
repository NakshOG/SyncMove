# SyncMove - Development TODO

## Completed ✅

### E2EE Core Infrastructure
- [x] lib/e2ee/x3dh.ts - X3DH key exchange
- [x] lib/e2ee/double-ratchet.ts - Double Ratchet algorithm
- [x] lib/e2ee/key-storage.ts - IndexedDB key storage
- [x] lib/e2ee/session.ts - Session management
- [x] lib/e2ee/file-encryption.ts - File encryption
- [x] lib/e2ee/compression.ts - Compression utilities

### E2EE Integration
- [x] Prisma KeyBundle model
- [x] /api/keys endpoints
- [x] useE2EE hook
- [x] E2EEProvider context
- [x] Chat encryption/decryption
- [x] Lock icon indicator

### Bug Fixes & UI
- [x] WebRTC ICE candidate race condition
- [x] DTLS-SRTP enforcement
- [x] Mobile code completely removed
- [x] Border radius standardized
- [x] Z-index layering fixed

### Documentation
- [x] ARCHITECTURE.md - Comprehensive system documentation

---

## Remaining Tasks

### 1. Group Encryption (Sender Keys) - IN PROGRESS
- [ ] Implement Sender Key generation
- [ ] Distribute sender keys to all members (encrypted per member)
- [ ] Encrypt group messages with sender key
- [ ] Re-encrypt on member join/leave
- [ ] Store sender key chains in IndexedDB

### 2. File Encryption
- [ ] Encrypt files before UploadThing upload
- [ ] Decrypt files on download
- [ ] Compress-then-encrypt workflow
- [ ] Handle encrypted file previews

### 3. Socket Security
- [ ] Socket-level authentication (validate Clerk on handshake)
- [ ] Heartbeat/ping-pong mechanism
- [ ] Rate limiting on socket events

### 4. TURN Server Config
- [ ] Add TURN server credentials
- [ ] Configure iceServers in WebRTC
- [ ] Deploy/provision TURN server

---

## Quick Status

| Category | Status |
|----------|--------|
| E2EE Core | ✅ Done |
| E2EE Integration | ✅ Done |
| Group Encryption | 🔄 In Progress |
| File Encryption | ⏳ Pending |
| Socket Auth | ⏳ Pending |
| TURN Config | ⏳ Pending |

---

## Group Encryption Approach (Sender Keys)

For efficient group messaging, we use **Sender Keys** instead of encrypting each message for every member.

```
Current Problem:
- 10 members = 10 encryptions per message = O(n) complexity

With Sender Keys:
- Each member generates ONE sender key for the group
- Encrypt once per message = O(1) complexity
- Members store sender keys from all other members
- When member joins/leaves, only that member needs new key
```

### Sender Key Distribution
```
1. Alice generates Sender Key (SK_A)
2. For each member M in group:
   - Derive shared secret using X3DH with M's session
   - Encrypt SK_A with shared secret
   - Store encrypted SK_A for M
3. When Alice sends:
   - Encrypt message with SK_A (one operation)
4. Each member decrypts with their copy of SK_A
```

### Message Format
```typescript
{
  v: 2,                    // Version
  type: "sender-key",
  senderId: "alice",
  senderKeyId: "key-123",  // Which sender key to use
  ciphertext: "base64...", // Message encrypted with sender key
  iv: "base64..."         // IV for AES-GCM
}
```