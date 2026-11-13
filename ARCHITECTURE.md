# SyncMove Architecture Documentation

> A comprehensive guide to how SyncMove works, why we chose each technology, and how all components interact.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Technology Stack](#technology-stack)
3. [Core Features & Architecture](#core-features--architecture)
   - [Authentication](#authentication)
   - [Real-Time Messaging](#real-time-messaging)
   - [Video/Audio Calls](#videoaudio-calls)
   - [End-to-End Encryption](#end-to-end-encryption)
   - [File Storage](#file-storage)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Database Schema](#database-schema)
6. [Security Considerations](#security-considerations)
7. [Deployment & Scaling](#deployment--scaling)

---

## High-Level Overview

SyncMove is a **desktop-first**, **end-to-end encrypted** video chat and messaging platform. Think of it as a self-hosted Discord alternative with Signal-level privacy.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐  │
│  │   React     │◄──┤   Zustand   │◄──┤  Socket.IO  │◄──┤ Mediasoup Client│  │
│  │   UI        │   │   State     │   │   Client    │   │   Media Stream  │  │
│  └──────┬──────┘   └─────────────┘   └─────────────┘   └─────────────────┘  │
│         │                                                                    │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    E2EE Layer (Web Crypto API)                        │   │
│  │  • X3DH Key Exchange  • Double Ratchet  • AES-GCM Encryption         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     API Layer (Next.js App Router)                     │   │
│  │  • Message CRUD  • Server/Channel Management  • Key Bundle API        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ HTTPS / WebSocket
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND SERVICES                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────┐ │
│  │   Next.js      │  │   MariaDB      │  │   Redis        │  │ Mediasoup  │ │
│  │   API Server   │◄─┤   (Prisma)     │◄─┤  Pub/Sub +     │◄─┤   SFU      │ │
│  │ + Socket.IO    │  │   + SQL Data   │  │  Presence      │  │  (Port 3333)│ │
│  └───────┬────────┘  └────────────────┘  └───────┬────────┘  └────────────┘ │
│          │                                         │                             │
│          └──────────────────────┬──────────────────┘                             │
│                                 ▼                                              │
│                        ┌────────────────┐                                        │
│                        │ UploadThing    │                                        │
│                        │ File Storage    │                                        │
│                        └────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

`Redis` is the shared realtime coordination layer for multi-instance deployments: it enables Socket.IO adapter fanout, cross-node presence sync, and pub/sub delivery for chat, server, and call events.

---

## Technology Stack

### Why We Chose Each Technology

| Technology           | Purpose                           | Why We Chose It                                                                   |
| -------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| **Next.js 16**       | Full-stack framework              | App Router, server components, built-in API routes, excellent DX                  |
| **React 19**         | UI library                        | Concurrent features, better performance, hooks API                                |
| **TypeScript**       | Type safety                       | Catch errors at compile time, excellent IDE support                               |
| **Clerk**            | Authentication                    | Secure, easy OAuth, handles sessions, security best practices                     |
| **Prisma + MariaDB** | ORM + Database                    | Type-safe queries, migrations, MySQL compatible                                   |
| **Redis**            | Distributed realtime coordination | Shared pub/sub, shared socket adapter, presence coordination across app instances |
| **Socket.IO**        | Real-time communication           | Fallback to polling, rooms, events, auto-reconnect, Redis adapter support         |
| **WebRTC**           | Video/Audio calls                 | Peer-to-peer via Mediasoup SFU (DTLS-SRTP)                       |
| **UploadThing**      | File uploads                      | Simple API, works with S3, presigned URLs                         |
| **Tailwind CSS**     | Styling                           | Rapid UI development, consistent design system                                    |
| **Zustand**          | State management                  | Simple, minimal boilerplate, works with React                                     |
| **Web Crypto API**   | Encryption                        | Native browser API, secure, no external dependencies                              |

---

## Core Features & Architecture

### Authentication

**Technology**: Clerk (Next.js SDK)

```
┌─────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. User visits /sign-in                                        │
│      ▼                                                           │
│   2. Clerk renders sign-in page (or we use custom)               │
│      ▼                                                           │
│   3. User authenticates (email/password/OAuth)                   │
│      ▼                                                           │
│   4. Clerk creates session cookie                                │
│      ▼                                                           │
│   5. All API requests include Clerk session                      │
│      ▼                                                           │
│   6. `currentProfile()` middleware validates session             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Files**:

- `lib/current-profile.ts` - Fetches user profile from Clerk
- `app/(auth)/**` - Auth routes (sign-in, sign-up)
- Middleware protects routes that require auth

**Why Clerk?**

- Handles security (password hashing, session management)
- OAuth providers (Google, GitHub, etc.)
- 2FA support
- User management dashboard

---

### Real-Time Messaging

**Technology**: Socket.IO + Redis adapter + EventEmitter + Prisma

```
┌─────────────────────────────────────────────────────────────────┐
│                   MESSAGE FLOW (Channel)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User A types message                                            │
│          │                                                       │
│          ▼                                                       │
│   POST /api/messages (REST API)                                  │
│          │                                                       │
│          ▼                                                       │
│   Prisma creates message in MariaDB                              │
│          │                                                       │
│          ▼                                                       │
│   Redis pub/sub or EventEmitter emits "channel-event"           │
│          │                                                       │
│          ▼                                                       │
│   Socket.IO server broadcasts to channel:{channelId} room        │
│          │                                                       │
│          ▼                                                       │
│   User B receives "message-event" via WebSocket                  │
│          │                                                       │
│          ▼                                                       │
│   React state updates, message appears                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Files**:

- `pages/api/socket/io.ts` - Socket.IO server setup and Redis adapter wiring
- `lib/realtime.ts` - Redis-aware event fanout with in-memory fallback
- `lib/redis.ts` - Redis client lifecycle management
- `app/api/messages/route.ts` - Message CRUD
- `components/providers/socket-provider.tsx` - Client socket connection
- `components/chat/chat-messages.tsx` - Message display

**Why This Architecture?**

1. **REST for persistence** - Messages stored in database, searchable
2. **WebSocket for real-time** - Instant delivery, presence
3. **Redis pub/sub** - Shared fanout across multiple app instances
4. **EventEmitter fallback** - Keeps local development simple when Redis is absent

**Socket Events**:
| Event | Direction | Purpose |
|-------|-----------|---------|
| `join-channel` | Client → Server | Join a channel room |
| `message-event` | Server → Client | New/updated/deleted message |
| `server-presence` | Server → Client | Online members |
| `call-presence` | Server → Client | Active call participants |

---

### Video/Audio Calls

**Technology**: WebRTC via Mediasoup SFU

```
┌─────────────────────────────────────────────────────────────────┐
│                      WEBRTC CALL FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User A clicks "Join Call"                                       │
│          │                                                       │
│          ▼                                                       │
│   navigator.mediaDevices.getUserMedia()                          │
│          │                                                       │
│          ▼                                                       │
│   Socket.IO: "join-call" → Server                                │
│          │                                                       │
│          ▼                                                       │
│   WebRTC: Create WebRtcTransport to Mediasoup SFU              │
│          │                                                       │
│          ▼                                                       │
│   SFU: Create producer (send stream)                            │
│          │                                                       │
│          ▼                                                       │
│   SFU: Broadcast producer to all consumers in room              │
│          │                                                       │
│          ▼                                                       │
│   Users B, C, D receive consumer streams from SFU              │
│          │                                                       │
│          ▼                                                       │
│   Media streams flow through SFU (not P2P)                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Files**:

- `components/chat/call-room.tsx` - Mediasoup client
- `server/mediasoup-server.ts` - SFU WebSocket signaling
- `app/api/calls/route.ts` - SFU API routes

**WebRTC Security**:

```typescript
// DTLS-SRTP is ENFORCED by Mediasoup
const transport = await worker.router.createWebRtcTransport({
  listenIps: [{ ip: '0.0.0.0', announcedIp: 'localhost' }],
  initialAvailableOutgoingBitrate: 1000000,
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
});

// All media is encrypted with SRTP
```

**SFU Server**:

- Mediasoup SFU runs on port 3333
- Handles all media routing
- No STUN/TURN needed (SFU acts as relay)
- Scalable to 100+ participants

**Why Mediasoup SFU?**

- Built into browsers (no plugins)
- Encrypts media by default (DTLS-SRTP)
- Scalable (SFU routing, not O(N²) P2P)
- Bandwidth efficient (O(N) complexity)

---

### End-to-End Encryption (E2EE)

**Technology**: Signal Protocol (custom implementation) + Web Crypto API

```
┌─────────────────────────────────────────────────────────────────┐
│                    E2EE ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    ZERO-KNOWLEDGE SERVER                     │ │
│  │                                                             │ │
│  │  • Stores only PUBLIC key components                        │ │
│  │  • Stores encrypted message ciphertexts                     │ │
│  │  • NEVER sees private keys                                  │ │
│  │  • CANNOT decrypt messages                                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              │ Public keys / encrypted msgs     │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      CLIENT DEVICES                          │ │
│  │                                                             │ │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │ │
│  │  │   Alice      │    │    Server    │    │     Bob      │  │ │
│  │  └──────┬───────┘    └──────────────┘    └──────┬───────┘  │ │
│  │         │                                       │          │ │
│  │         │  1. Download Bob's public key bundle  │          │ │
│  │         │ ───────────────────────────────────► │          │ │
│  │         │                                       │          │ │
│  │         │  2. X3DH key exchange (offline)       │          │ │
│  │         │ ◄─────────────────────────────────── │          │ │
│  │         │                                       │          │ │
│  │         │  3. Encrypt message with Double       │          │ │
│  │         │     Ratchet (per-message keys)        │          │ │
│  │         │                                       │          │ │
│  │         │  4. Send encrypted to server          │          │ │
│  │         │ ────────────────────────────────────►│          │ │
│  │         │                                       │          │ │
│  │         │                                       │ 5. Forward│ │
│  │         │                                       │─────────►│ │
│  │         │                                       │          │ │
│  │         │                          6. Bob decrypts           │ │
│  │         │                          with his private key      │ │
│  │         │◄─────────────────────────────────────              │ │
│  └─────────┴────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Key Technologies

**1. X3DH (Extended Triple Diffie-Hellman)**

- Asynchronous key exchange (Bob doesn't need to be online)
- Uses Identity Keys, Signed Pre-Keys, One-Time Pre-Keys
- Establishes shared secret

**2. Double Ratchet Algorithm**

- Derives new keys for each message
- **Forward Secrecy** - past messages safe if key compromised
- **Post-Compromise Security** - sessions auto-heal

**3. AES-GCM**

- Authenticated encryption (integrity + confidentiality)
- 256-bit keys
- Used for message encryption

**Files**:

- `lib/e2ee/x3dh.ts` - X3DH key exchange
- `lib/e2ee/double-ratchet.ts` - Per-message encryption
- `lib/e2ee/key-storage.ts` - IndexedDB storage (keys never leave device)
- `lib/e2ee/session.ts` - Session management
- `hooks/use-e2ee.ts` - React hook for E2EE
- `components/providers/e2ee-provider.tsx` - Context provider
- `app/api/keys/` - Key bundle API

**Why This Implementation?**

- **Signal Protocol** - Proven, audited, used by WhatsApp/Signal
- **Web Crypto API** - Native browser crypto, no external dependencies
- **IndexedDB** - Private keys stored securely on device

---

### File Storage

**Technology**: UploadThing + S3-compatible storage

```
┌─────────────────────────────────────────────────────────────────┐
│                     FILE UPLOAD FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User attaches file                                              │
│          │                                                       │
│          ▼                                                       │
│   Client requests presigned URL from our API                     │
│          │                                                       │
│          ▼                                                       │
│   Our API calls UploadThing (validates auth)                     │
│          │                                                       │
│          ▼                                                       │
│   UploadThing returns presigned URL                              │
│          │                                                       │
│          ▼                                                       │
│   Client uploads directly to S3 (bypasses our server)            │
│          │                                                       │
│          ▼                                                       │
│   S3 returns file URL                                             │
│          │                                                       │
│          ▼                                                       │
│   Client includes URL in message (encrypted or plaintext)        │
│          │                                                       │
│          ▼                                                       │
│   Recipient downloads via URL                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Files**:

- `lib/uploadthing.ts` - UploadThing configuration
- `app/api/uploadthing/` - UploadThing API routes
- `components/ui/file-upload.tsx` - Upload UI component

**Why UploadThing?**

- Simple API
- Handles S3 complexity
- Presigned URLs (direct upload, no server bottleneck)
- Image optimization options

---

## Data Flow Diagrams

### Sending an Encrypted Message

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                               │
│  User A → Chat Input                                                          │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    E2EE ENCRYPTION LAYER                              │    │
│  │                                                                      │    │
│  │  1. Check if session exists with each recipient                       │    │
│  │     • No session? Fetch key bundle from /api/keys/[userId]           │    │
│  │     • Perform X3DH to establish session                               │    │
│  │                                                                      │    │
│  │  2. Encrypt message with Double Ratchet                               │    │
│  │     • Derive message key                                              │    │
│  │     • Encrypt with AES-GCM                                            │    │
│  │     • Output: { userId: "abc", ciphertext: "base64..." }             │    │
│  │                                                                      │    │
│  │  3. Format message                                                    │    │
│  │     { v: 1, type: "channel", encrypted: [...] }                      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                                                                     │
│         ▼                                                                     │
│  POST /api/messages { content: "{...encrypted...}", encrypted: true }         │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      NEXT.JS API ROUTE                               │    │
│  │                                                                      │    │
│  │  1. Validate Clerk session                                           │    │
│  │  2. Validate channel membership                                      │    │
│  │  3. Store in MariaDB (Prisma)                                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    EVENT EMITTER (lib/realtime.ts)                   │    │
│  │                                                                      │    │
│  │  publishChannelEvent(channelId, { type: "created", message })       │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SOCKET.IO SERVER (pages/api/socket/io.ts)        │    │
│  │                                                                      │    │
│  │  io.to(`channel:${channelId}`).emit("message-event", event)         │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                                                                     │
│         ▼                                                                     │
│  Socket.IO WebSocket → User B                                                │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    CLIENT (chat-messages.tsx)                        │    │
│  │                                                                      │    │
│  │  1. Receive encrypted message                                        │    │
│  │  2. Find session with sender                                         │    │
│  │  3. Decrypt with Double Ratchet                                      │    │
│  │  4. Render decrypted text with 🔒 indicator                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Joining a Video Call

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                               │
│  User A → Call Room                                                           │
│         │                                                                     │
│         ▼                                                                     │
│  navigator.mediaDevices.getUserMedia({ video, audio })                       │
│         │                                                                     │
│         ▼                                                                     │
│  Socket.IO: "join-call" → Server                                              │
│         │                                                                     │
│         ▼                                                                     │
│  Server broadcasts "call-presence" to channel                                │
│         │                                                                     │
│         ▼                                                                     │
│  Socket.IO: "call-existing-peers" → User A                                    │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    WEBRTC SIGNALING                                  │    │
│  │                                                                      │    │
│  │  For each peer:                                                      │    │
│  │  1. Create RTCPeerConnection                                         │    │
│  │  2. Create offer → setLocalDescription                               │    │
│  │  3. Send "call-signal" (offer) via Socket.IO                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                                                                     │
│         ▼                                                                     │
│  Socket.IO: "call-signal" → Peer                                              │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PEER (WebRTC)                                     │    │
│  │                                                                      │    │
│  │  1. Receive offer                                                    │    │
│  │  2. setRemoteDescription(offer)                                      │    │
│  │  3. Create answer                                                    │    │
│  │  4. setLocalDescription(answer)                                      │    │
│  │  5. Send "call-signal" (answer) back                                 │    │
│  │                                                                      │    │
│  │  6. ICE candidate exchange (trickle ICE)                            │    │
│  │                                                                      │    │
│  │  7. ontrack event fires → video stream added to UI                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Models

```prisma
// User profile linked to Clerk authentication
model Profile {
  id       String @id @default(uuid())
  userId   String @unique           // Clerk user ID
  name     String
  imageUrl String @db.Text
  email    String @db.Text

  servers  Server[]
  members  Member[]
  channels Channel[]
  CreatedAt DateTime @default(now())
  UpdatedAt DateTime @updatedAt
}

// A Discord-like server/guild
model Server {
  id         String @id @default(uuid())
  name       String
  imageURL   String @db.Text
  inviteCode String @unique

  members    Member[]
  channels   Channel[]
  CreatedAt  DateTime @default(now())
  UpdatedAt  DateTime @updatedAt

  profileId String
  profile   Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)
}

// User's membership in a server
model Member {
  id   String     @id @default(uuid())
  role MemberRole @default(GUEST)  // ADMIN, MODERATOR, GUEST

  serverId String
  server   Server @relation(fields: [serverId], references: [id], onDelete: Cascade)

  profileId String
  profile   Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  messages Message[]
  CreatedAt DateTime @default(now())
  UpdatedAt DateTime @updatedAt

  @@unique([profileId, serverId])  // One membership per user per server
}

// Channel within a server (TEXT, AUDIO, or VIDEO)
model Channel {
  id   String      @id @default(uuid())
  name String
  type ChannelType @default(TEXT)

  serverId String
  server   Server @relation(fields: [serverId], references: [id], onDelete: Cascade)

  profileId String
  profile   Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  messages Message[]
  CreatedAt DateTime @default(now())
  UpdatedAt DateTime @updatedAt
}

// Channel message (potentially encrypted)
model Message {
  id String @id @default(uuid())
  content String @db.Text          // Plaintext OR encrypted JSON
  fileUrl String? @db.Text
  deleted Boolean @default(false)
  pinned Boolean @default(false)
  memberId String
  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
  channelId String
  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  CreatedAt DateTime @default(now())
  UpdatedAt DateTime @updatedAt
}

// E2EE Key Bundle (PUBLIC keys only - private keys stored in IndexedDB)
model KeyBundle {
  id            String   @id @default(uuid())
  userId        String   @unique

  // Public key components (never private keys!)
  identityKey   String   @db.Text   // X25519 public key
  signedPreKey  String   @db.Text   // X25519 public key
  signature     String   @db.Text   // Ed25519 signature of SPK

  // One-time pre-key (null when exhausted)
  oneTimePreKeyId String?
  oneTimePreKey   String? @db.Text

  created       DateTime @default(now())
  updated       DateTime @updatedAt
}
```

### Entity Relationship Diagram

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Profile   │ 1──N    │   Server    │ 1──N    │   Channel   │
│─────────────│         │─────────────│         │─────────────│
│ userId (PK) │         │ id (PK)     │         │ id (PK)     │
│ name        │         │ name        │         │ name        │
│ email       │         │ inviteCode  │         │ type        │
│ imageUrl    │         └──────┬──────┘         └──────┬──────┘
└─────────────┘                │ N                      │ N
        │ N                    ▼                        ▼
        │           ┌─────────────────┐       ┌─────────────────┐
        │           │     Member      │       │     Message     │
        │           │─────────────────│       │─────────────────│
        └──────────►│ id (PK)         │       │ id (PK)         │
                    │ role            │       │ content (enc)   │
                    │ serverId (FK)   │◄──────┤ fileUrl         │
                    │ profileId (FK)  │       │ channelId (FK)  │
                    └─────────────────┘       │ memberId (FK)   │
                                              └─────────────────┘

┌─────────────────┐
│   KeyBundle     │
│─────────────────│
│ id (PK)         │
│ userId (FK)     │
│ identityKey     │
│ signedPreKey    │
│ signature       │
│ oneTimePreKey   │
└─────────────────┘
```

---

## Security Considerations

### What We Protect

| Asset               | Protection                                  |
| ------------------- | ------------------------------------------- |
| **Message content** | E2EE (Signal Protocol) - Server cannot read |
| **Media streams**   | DTLS-SRTP - Encrypted P2P                   |
| **Private keys**    | IndexedDB only - Never transmitted          |
| **User passwords**  | Clerk handles - We never see them           |
| **File content**    | Encrypt before upload (future)              |

### Threat Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      THREAT MODEL                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. COMPROMISED SERVER                                            │
│     • Can see: message ciphertexts, public keys, metadata        │
│     • Cannot see: message content (encrypted), private keys      │
│     • Cannot decrypt: messages (no private keys)                 │
│                                                                  │
│  2. COMPROMISED DATABASE                                          │
│     • Same as above - data already encrypted                      │
│                                                                  │
│  3. MAN-IN-THE-MIDDLE (MITM)                                      │
│     • TLS protects data in transit                                │
│     • DTLS-SRTP protects media streams                           │
│     • X3DH prevents impersonation                                 │
│                                                                  │
│  4. COMPROMISED CLIENT DEVICE                                     │
│     • Attacker can read IndexedDB (private keys)                 │
│     • Can decrypt future messages                                 │
│     • CANNOT decrypt past messages (Forward Secrecy)             │
│                                                                  │
│  5. SESSION HIJACKING                                             │
│     • Clerk sessions are HttpOnly, Secure cookies                 │
│     • Socket auth validates sessions                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Security Best Practices Implemented

1. **Key Separation** - Public/private keys never mixed
2. **Forward Secrecy** - Double Ratchet derives new keys per message
3. **Certificate Pinning** - WebRTC DTLS certificates
4. **Input Validation** - Zod schemas on all API inputs
5. **SQL Injection Prevention** - Prisma ORM uses parameterized queries
6. **XSS Prevention** - React auto-escapes, CSP headers

---

## Deployment & Scaling

### Architecture Diagram

```
                                    ┌─────────────────┐
                                    │   Load Balancer │
                                    │   (Vercel/Cloud │
                                    │    / Railway)   │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
           ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
           │   Next.js App   │     │   MariaDB       │     │   Redis         │
           │   (Vercel)      │     │   (Prisma/      │     │   Pub/Sub +     │
           │   - API Routes  │     │   MySQL/MariaDB)│     │   Presence      │
           │   - Socket.IO   │     │   - Messages    │     │   - Rooms       │
           │   - SSR         │     │   - Key Bundles │     │   - Fanout      │
           └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
                    │                       │                        │
                    │                       │                        │
                    └──────────────┬────────┴───────────────┬──────────────┘
                                   ▼                               ▼
                         ┌─────────────────┐           ┌─────────────────┐
                         │   Socket.IO     │           │   TURN Server   │
                         │   Adapter/Rooms │           │   (Coturn/      │
                         │   Shared State  │           │    OpenRelay)   │
                         └─────────────────┘           │   - NAT         │
                                                       │   Traversal     │
                                                       │   - Relay       │
                                                       └─────────────────┘

                         ┌─────────────────┐
                         │  UploadThing    │
                         │  (S3-based)     │
                         │  - Files        │
                         │  - Images       │
                         └─────────────────┘
```

Redis is the coordination layer that lets multiple app nodes share room state, presence, and realtime events without losing synchronization.

### Scaling Considerations

| Component       | Scaling Strategy                                                          |
| --------------- | ------------------------------------------------------------------------- |
| **Next.js**     | Serverless (Vercel) - auto-scales                                         |
| **MariaDB**     | Primary database remains the ACID source of truth; replica for read scale |
| **Socket.IO**   | Horizontal scaling with Redis adapter (for multiple instances)            |
| **TURN Server** | Add more instances behind load balancer for call capacity                 |
| **UploadThing** | S3 handles storage, CDN for delivery                                      |

### ACID and Read-Replica Discipline

For real transactional correctness, the primary database remains the only authority for writes:

- write operations are committed to the primary database
- replica nodes are used for read-heavy workloads only
- read replicas may lag behind the primary, so they are not valid for write-after-read checks
- session state, message creation, member changes, and key bundle writes must be enforced on the primary

This matters because a replica is a scale optimization, not a replacement for ACID semantics.

A common production pattern is:

- primary: transactional writes, ledger-style operations, and critical queries
- replica: message listing, server/member queries, dashboards, and analytics

The local prototype intentionally follows the same rule, even though it is simplified for demo purposes.

### Environment Variables

```bash
# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Database
DATABASE_URL="mysql://..."

# UploadThing
UPLOADTHING_SECRET=sk_live_...
UPLOADTHING_APP_ID=...

# TURN Server (for WebRTC NAT traversal)
TURN_SERVER_URL=your-turn-server.com:3478
TURN_USERNAME=username
TURN_PASSWORD=password
```

---

## File Structure

```
SyncMove/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth routes (sign-in, sign-up)
│   ├── (main)/                   # Main app routes
│   │   ├── conversations/        # DMs
│   │   ├── servers/              # Server views
│   │   │   └── [serverID]/
│   │   │       └── channels/
│   │   │           └── [channelID]/  # Chat/call views
│   │   └── layout.tsx            # Main layout with sidebar
│   ├── api/                      # API routes
│   │   ├── channels/
│   │   ├── conversations/
│   │   ├── keys/                 # E2EE key bundles
│   │   ├── messages/
│   │   ├── servers/
│   │   ├── uploadthing/
│   │   └── socket/               # Socket.IO server
│   └── layout.tsx                # Root layout
│
├── components/
│   ├── chat/                     # Chat UI
│   │   ├── call-room.tsx         # WebRTC video/audio
│   │   ├── chat-input.tsx        # Message input
│   │   └── chat-messages.tsx     # Message list
│   ├── modals/                   # Modal dialogs
│   ├── navigation/               # Navigation
│   ├── providers/                # Context providers
│   │   ├── e2ee-provider.tsx     # E2EE context
│   │   ├── socket-provider.tsx   # Socket.IO context
│   │   └── theme-provider.tsx    # Theme context
│   └── ui/                       # Shadcn UI components
│
├── hooks/
│   └── use-e2ee.ts               # E2EE React hook
│
├── lib/
│   ├── current-profile.ts        # Clerk auth
│   ├── db.ts                     # Prisma client
│   ├── e2ee/                     # E2EE implementation
│   │   ├── compression.ts
│   │   ├── double-ratchet.ts
│   │   ├── file-encryption.ts
│   │   ├── hkdf.ts
│   │   ├── key-storage.ts
│   │   ├── session.ts
│   │   ├── sha256.ts
│   │   └── x3dh.ts
│   ├── realtime.ts               # EventEmitter
│   └── utils.ts                  # Utilities
│
├── pages/
│   └── api/
│       └── socket/
│           └── io.ts             # Socket.IO server
│
├── prisma/
│   └── schema.prisma             # Database schema
│
├── public/                       # Static assets
├── types/                        # TypeScript types
└── papers/
    └── ZeroKnowledgeE2EEArchitecture.md
```

---

## Quick Start for Developers

### Prerequisites

1. Node.js 18+
2. MySQL/MariaDB running
3. Clerk account
4. UploadThing account

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Fill in Clerk, DB, UploadThing credentials

# 3. Generate Prisma client
npm run db:generate

# 4. Push schema to database
npm run db:push

# 5. Start development server
npm run dev
```

### Key Files to Understand

| File                            | Purpose                            |
| ------------------------------- | ---------------------------------- |
| `pages/api/socket/io.ts`        | Socket.IO server, real-time events |
| `lib/e2ee/x3dh.ts`              | Key exchange implementation        |
| `lib/e2ee/double-ratchet.ts`    | Message encryption                 |
| `prisma/schema.prisma`          | Database schema                    |
| `components/chat/call-room.tsx` | WebRTC video calls                 |
| `docker-compose.yml`            | Application container deployment   |

---

## Docker Deployment

SyncMove supports full Docker deployment with all services.

### Quick Start

```bash
# Clone and configure
cp .env.example .env
# Edit .env with your credentials

# Start all services
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

### Services Included

| Service | Image          | Port | Purpose                |
| ------- | -------------- | ---- | ---------------------- |
| app     | Next.js custom | 3000 | Web application        |
| db      | MariaDB 10.11  | 3306 | Database               |
| coturn  | coturn/coturn  | 3478 | TURN server (optional) |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                            │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│  │   App    │────▶│   DB     │     │  Coturn  │            │
│  │ :3000    │     │ :3306    │     │ :3478    │            │
│  └──────────┘     └──────────┘     └──────────┘            │
└─────────────────────────────────────────────────────────────┘
         │                                         │
         ▼                                         ▼
    localhost:3000                         UDP/TCP :3478
```

### Environment Variables

Required in `.env`:

- `DATABASE_URL` - MySQL connection string
- `CLERK_*` - Clerk authentication
- `UPLOADTHING_*` - File storage credentials
- `NEXT_PUBLIC_TURN_*` - TURN server (optional for local dev)

### Production Considerations

1. **Use secrets management** for production credentials
2. **Enable TLS** with Traefik or nginx proxy
3. **Scale horizontally** - app container is stateless
4. **Configure CORS** for production domains

---

## Future Improvements

| Priority | Feature            | Description                       |
| -------- | ------------------ | --------------------------------- |
| High     | Thread Support     | Nested message threads            |
| High     | Reactions          | Emoji reactions to messages       |
| Medium   | Push Notifications | Web Push API for offline messages |
| Medium   | Message Search     | Full-text encrypted search        |
| Low      | Voice Messages     | Audio message recording           |
| Low      | Screen Sharing     | Share screen in video calls       |

---

_Document generated: November 2026_
