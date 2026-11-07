# Zero-Knowledge End-to-End Encryption Architecture

## Based on Signal Protocol

### References

This architecture is based on the Signal Protocol specifications:

1. **Signal Protocol Documentation**
   - URL: https://signal.org/docs/
   - The Signal Protocol is an open-source cryptographic protocol developed by Signal Messenger LLC
   - Provides forward secrecy and post-compromise security

2. **X3DH (Extended Triple Diffie-Hellman) Key Agreement Protocol**
   - URL: https://signal.org/docs/specifications/x3dh/
   - Used for establishing initial shared secret between parties
   - Enables asynchronous key exchange (parties don't need to be online simultaneously)

3. **Double Ratchet Algorithm**
   - URL: https://signal.org/docs/specifications/doubleratchet/
   - Provides per-message forward secrecy
   - Continues ratcheting even when one party goes offline

4. **Additional Resources**
   - WhatsApp Encryption Overview: https://www.whatsapp.com/security/
   - Open Whisper Systems research papers
   - libsignal library: https://github.com/signalapp/libsignal

---

## Overview

This document describes a zero-knowledge end-to-end encryption (E2EE) architecture for SyncMove, ensuring that even server administrators cannot access user message content or encryption keys.

### Core Principles

1. **Zero Knowledge**: Server stores only encrypted data; cannot decrypt messages
2. **Forward Secrecy**: Compromising long-term keys doesn't expose past messages
3. **Post-Compromise Security**: Sessions automatically heal after key compromise
4. **Asynchronous**: Users can exchange messages without both being online simultaneously

---

## Architecture Components

### 1. Key Generation (Device-Only)

Keys are generated locally on each device and **never** transmitted to the server.

| Key Type | Purpose | Storage |
|----------|---------|---------|
| Identity Key Pair | Long-term identity verification | Device (IndexedDB) |
| Signed Pre-Key (SPK) | Medium-term key with signature | Server (public), Device (private) |
| One-Time Pre-Keys (OPKs) | Single-use keys for initial handshake | Server (public), Device (none) |
| Ephemeral Keys | Per-session keys | Local memory only |

### 2. X3DH Key Exchange

Initial handshake uses Extended Triple Diffie-Hellman to establish shared secret:

```
Inputs:
  Alice: IkA (Identity Key), SPKr (Signed Pre-Key), OPKr (One-Time Pre-Key)
  Bob: IkB (Identity Key), SPKs (Signed Pre-Key), OPKs (One-Time Pre-Keys)

Outputs:
  Shared Key: K = HKDF(IK_A·IK_B || SPKs·Ik_A || Ek_B·Ik_A || OPKs·Ik_A)
```

### 3. Double Ratchet Encryption

After initial handshake, each message uses a new key:

```
┌─────────────────────────────────────────────────┐
│                    Message Chain                 │
├─────────────────────────────────────────────────┤
│ Msg 1 → Key₁ → K₁ratchet → K₁message            │
│ Msg 2 → Key₂ → K₂ratchet → K₂message            │
│ Msg 3 → Key₃ → K₃ratchet → K₃message            │
│ ...                                             │
└─────────────────────────────────────────────────┘

Each message uses a unique key. Compromise of one key
only decrypts that single message.
```

### 4. Zero-Knowledge Server View

| Data | Server Access | Client Access |
|------|---------------|---------------|
| Public Keys | ✅ Read-only | ✅ All |
| Encrypted Messages | ❌ Cannot decrypt | ✅ Decrypt |
| Key IDs | ✅ Metadata only | ✅ All |
| Delivery Status | ✅ Yes | ✅ Yes |
| Private Keys | ❌ Never transmitted | ✅ Local only |

---

## Implementation Roadmap

### Phase 1: Core E2EE Infrastructure
- `lib/e2ee/x3dh.ts` - X3DH key exchange implementation
- `lib/e2ee/double-ratchet.ts` - Double Ratchet algorithm
- `lib/e2ee/keys.ts` - Key generation and storage utilities
- `lib/e2ee/session.ts` - Session management

### Phase 2: Messaging Integration
- Encrypt messages before API submission
- Decrypt on receive before rendering
- Key bundle upload/download API endpoints
- Pre-key bundle server storage (Prisma schema update)

### Phase 3: Group Encryption
- Sender Keys for efficient group messaging
- Per-member key distribution
- Group key rotation mechanism
- Encrypted file attachments

### Phase 4: File Encryption
- Client-side compression (CompressionStream API)
- AES-GCM 256-bit file encryption
- Key derivation from message master key
- Encrypted blob upload to storage

### Phase 5: Backup & Recovery
- Password-derived key backup encryption
- Optional social recovery
- Device transfer mechanism

---

## Security Properties

### Forward Secrecy
```
If an attacker compromises a device at time T:
- They CAN access messages sent AFTER T (if current session)
- They CANNOT access messages sent BEFORE T (previous sessions)
- They CANNOT access messages after new session established
```

### Post-Compromise Security
```
If an attacker compromises a key at time T:
- Sessions automatically ratchet forward
- New messages use new keys
- Compromise only affects limited time window
```

### Asynchronous Security
```
Bob doesn't need to be online for Alice to send message:
1. Bob uploads pre-key bundles to server
2. Alice downloads bundle, performs X3DH
3. Alice sends encrypted message
4. Bob downloads and decrypts when online
```

---

## Compliance & Standards

This implementation follows:
- E2EE best practices from Signal Protocol
- Modern cryptographic standards (X25519, Ed25519, AES-GCM)
- Privacy-by-design principles
- Zero-knowledge architecture patterns

---

## References Summary

| Source | URL | Concept |
|--------|-----|---------|
| Signal Docs | https://signal.org/docs/ | Complete protocol specs |
| X3DH Spec | https://signal.org/docs/specifications/x3dh/ | Initial key exchange |
| Double Ratchet | https://signal.org/docs/specifications/doubleratchet/ | Per-message encryption |
| WhatsApp Security | https://www.whatsapp.com/security/ | Production deployment |
| libsignal | https://github.com/signalapp/libsignal | Reference implementation |

---

*Document created: November 2026*
*Architecture version: 1.0*
*Based on Signal Protocol v3.0+ specifications*