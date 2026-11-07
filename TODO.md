# SyncMove - Development TODO

## Completed ✅

### E2EE Core (Weeks 1-2)
- [x] lib/e2ee/x3dh.ts - X3DH key exchange
- [x] lib/e2ee/double-ratchet.ts - Double Ratchet algorithm
- [x] lib/e2ee/key-storage.ts - IndexedDB key storage
- [x] lib/e2ee/session.ts - Session management
- [x] lib/e2ee/file-encryption.ts - File encryption
- [x] lib/e2ee/compression.ts - Compression utilities
- [x] lib/e2ee/hkdf.ts, sha256.ts - Cryptographic primitives
- [x] lib/e2ee/index.ts - Main exports
- [x] papers/ZeroKnowledgeE2EEArchitecture.md - Architecture document

### Bug Fixes & UI (Commit f214164)
- [x] WebRTC ICE candidate race condition fixed
- [x] DTLS-SRTp enforcement for encrypted calls
- [x] Connection quality indicator added
- [x] Mobile code completely removed
- [x] Border radius standardized (rounded-xl)
- [x] Z-index layering fixed (emoji picker, modals)
- [x] Smooth hover transitions added
- [x] Accessibility: aria-labels added

---

## Remaining Tasks

### 1. E2EE Integration
- [ ] Key bundle API endpoints (`app/api/keys/*`)
- [ ] Prisma schema for KeyBundle model
- [ ] Encrypt messages in chat-input before send
- [ ] Decrypt messages in chat-messages on receive
- [ ] Graceful fallback for non-E2EE messages

### 2. Socket Security
- [ ] Socket-level authentication (validate Clerk on handshake)
- [ ] Heartbeat/ping-pong mechanism
- [ ] Rate limiting on socket events

### 3. WebRTC Improvements
- [ ] Add TURN server credentials to environment
- [ ] Adaptive bitrate based on bandwidth
- [ ] Codec negotiation (VP8/VP9 preference)
- [ ] Call timeout handling

### 4. UI Polish
- [ ] Chat messages - improve bubble design
- [ ] Server sidebar - better active state
- [ ] Focus-visible states for keyboard navigation
- [ ] Loading states for async operations

### 5. Testing
- [ ] Unit tests for E2EE utilities
- [ ] WebRTC call flow tests
- [ ] Socket event tests

---

## Quick Status

| Category | Status |
|----------|--------|
| E2EE Core | ✅ Done |
| Mobile Removed | ✅ Done |
| WebRTC Bug Fixes | ✅ Done |
| UI Consistency | ✅ Done |
| E2EE Integration | 🔄 In Progress |
| Socket Auth | ⏳ Pending |
| TURN Config | ⏳ Pending |
| Testing | ⏳ Pending |

---

## Environment Variables Needed

```bash
# For TURN server (NAT traversal)
TURN_SERVER_URL=your-turn-server.com:3478
TURN_USERNAME=your-username
TURN_PASSWORD=your-password

# For E2EE key backup (optional)
ENCRYPTION_KEY_SALT=your-salt-value
```