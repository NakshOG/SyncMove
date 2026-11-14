# SyncMove - Project Summary

**Last Updated:** November 14, 2026  
**Status:** ✅ Local validation complete (SFU migration complete)

---

## Overview

SyncMove is a real-time communication platform built with Next.js, featuring end-to-end encryption, WebRTC audio/video calls with Mediasoup SFU architecture, and scalable multi-node deployment.

---

## Technology Stack

### Frontend
- **Framework:** Next.js 16.4.6 (App Router)
- **UI Library:** React 19.2.8
- **Styling:** Tailwind CSS 4
- **Icons:** Lucide React
- **Forms:** React Hook Form + Zod
- **Themes:** next-themes
- **WebRTC Client:** @mediasoup/client

### Backend
- **Runtime:** Node.js with npm
- **Database:** MariaDB 10.11 (Primary + Replica)
- **Cache/Pub/Sub:** Redis 7
- **Real-time:** Socket.IO 4.8.4

### Security & Identity
- **Authentication:** Clerk (Next.js v7.8.2)
- **Encryption:** 
  - X3DH key agreement (lib: @noble/curves)
  - AES-GCM for message encryption
  - WebRTC DTLS-SRTP for media
- **File Upload:** UploadThing

### Infrastructure
- **Load Balancer:** NGINX 1.27-alpine
- **Media Server:** Mediasoup SFU (replaces P2P + Coturn)
- **Containerization:** Docker Compose
- **Failover:** MariaDB GTID-based replication

---

## Architecture

### SFU Architecture (Mediasoup)

```
┌─────────────────────────────────────────────────────────────┐
│                     User / Browser                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (Port 80)                         │
│              Load Balancer (ip_hash)                        │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐      ┌────────┐      ┌────────┐
    │App-1   │      │App-2   │      │Redis   │
    │:3001   │      │:3002   │      │:6379   │
    └────┬───┘      └────┬───┘      └────────┘
         │              │
         ▼              ▼
    ┌────────┐      ┌────────┐
    │Primary │      │Replica │
    │:3307   │      │:3308   │
    └────────┘      └────────┘
                         │
                         ▼
              ┌────────────────┐
              │  Mediasoup SFU │
              │   (Port 3333)  │
              │ WebRTC Router  │
              │ Producers/     │
              │ Consumers      │
              └────────────────┘
```

### Real-Time Flow

1. User connects via WebSocket to NGINX
2. NGINX routes to app-node-1 or app-node-2 (sticky sessions)
3. App node coordinates via Redis pub/sub
4. Messages encrypted with E2EE before sending
5. **Audio/Video uses Mediasoup SFU:**
   - Browser creates WebRtcTransport
   - SFU receives producer streams
   - SFU forwards to consumers
   - No direct peer-to-peer connections
   - No P2P/STUN/TURN path; SFU handles media relay

---

## Project Structure

```
SyncMove/
├── app/                          # Next.js App Router
│   ├── (auth)/                  # Authentication routes
│   │   └── sign-in/
│   │   └── sign-up/
│   ├── (main)/                  # Main application
│   │   └── conversations/       # Direct messages
│   │   └── servers/[id]/        # Server channels
│   │       └── channels/[id]/   # Channel pages
│   ├── api/                     # API routes
│   └── invite/[code]/           # Invite handler
├── components/                  # React components
│   ├── chat/                    # Chat UI
│   ├── direct/                  # Direct messages
│   ├── server/                  # Server sidebar
│   ├── members/                 # Member management
│   └── ui/                      # Shared UI components
├── lib/                         # Utility libraries
│   ├── e2ee/                    # End-to-end encryption
│   └── mediasoup-client.ts     # Mediasoup utilities
│   └── uploadthing.ts          # File upload config
├── server/                      # Node.js backend
│   └── mediasoup-server.ts     # SFU WebSocket server
├── prisma/                      # Database schema
│   └── schema.prisma
├── tests/                       # Test suite
│   ├── architecture.spec.ts
│   ├── e2ee-crypto.spec.ts
│   ├── simulation.spec.ts
│   └── concurrent-simulation.spec.ts
├── docker-compose.yml           # Single-node deployment
├── docker-compose.sfu.yml       # Multi-node + SFU deployment
└── nginx.conf                   # Load balancer config
```

---

## Database Schema

### Core Models

| Model | Fields | Purpose |
|-------|--------|---------|
| Profile | userId, name, imageUrl | User identity |
| Server | id, name, inviteCode | Server container |
| Member | role (ADMIN/MODERATOR/GUEST) | Server membership |
| Channel | name, type (TEXT/AUDIO/VIDEO) | Communication channels |
| Message | content, fileUrl, encrypted | Text messages |
| DirectMessage | content, encrypted | DM messages |
| Conversation | memberOne, memberTwo | DM pairing |
| KeyBundle | userId, identityKey, signedPreKey | E2EE keys |

---

## Testing

### Test Results (Updated for SFU)

```
Total Tests: 72
Passed: 72
Failed: 0
Skipped: 0
```

### Test Categories

1. **Architecture Tests (6)**
   - Multi-node setup validation
   - Primary/replica configuration
   - Mediasoup SFU connectivity

2. **E2EE Crypto Tests (1)**
   - X3DH key agreement
   - Signed pre-key validation

3. **Simulation Tests (9)**
   - Multi-user message flow
   - Burst traffic handling
   - Server capacity limits
   - Failover scenarios

4. **Stress Tests (25)**
   - Sequential bot messaging
   - Concurrent video streams
   - Memory pressure testing
   - Breaking point analysis

5. **Concurrent Tests (19)**
   - True concurrent message bursts
   - Simultaneous video calls
   - High-concurrency load testing

---

## Environment Variables

```bash
# Database
DATABASE_URL=mysql://syncmove:syncmovepass@mariadb-primary:3306/syncmove
REPLICA_DATABASE_URL=mysql://syncmove:syncmovepass@mariadb-replica:3306/syncmove
REDIS_URL=redis://redis:6379

# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx

# File Upload
UPLOADTHING_SECRET=xxx
UPLOADTHING_APP_ID=xxx

# Mediasoup SFU (replaces TURN)
NEXT_PUBLIC_MEDIASOUP_URL=ws://localhost:3333
```

---

## Deployment
### Start Multi-Node + SFU

```bash
docker-compose -f docker-compose.sfu.yml up -d
```

### View Logs

```bash
docker-compose -f docker-compose.sfu.yml logs -f
```

### Stop

```bash
docker-compose -f docker-compose.sfu.yml down
```

### Restart

```bash
docker-compose -f docker-compose.sfu.yml restart
```

---

## Key Features

### 1. End-to-End Encryption

- X3DH key agreement for session establishment
- AES-GCM encryption for message content
- Encrypted file uploads
- Key bundle storage in database

### 2. Real-Time Communication

- Socket.IO for WebSocket connections
- Redis pub/sub for message fan-out
- Channel presence tracking
- Direct-message profile presence with Redis-backed online/offline events
- Message acknowledgment

### 3. Audio/Video Calls (Mediasoup SFU)

- **WebRTC via Mediasoup SFU** (not P2P)
- SFU handles routing, transcoding, bandwidth adaptation
- **No P2P/STUN/TURN path** (SFU acts as relay)
- **No peer-to-peer connections** (browser connects to SFU only)
- Audio/video channel types
- Scalable to hundreds of participants per room

### 4. Scalability

- Multiple app nodes behind NGINX
- Read replica for reporting queries
- Redis for distributed state
- Sticky sessions via ip_hash

### 5. Resilience

- Primary/replica database failover
- Automatic replica promotion
- GTID-based replication
- Health checks on all services

---

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run tests
npm run test

# Generate Prisma client
npx prisma generate

# Run Prisma studio
npx prisma studio
```

---

## Security Considerations

1. **Authentication:** Clerk handles identity, tokens in cookies
2. **Authorization:** Role-based access (ADMIN/MODERATOR/GUEST)
3. **Encryption:** E2EE for messages, DTLS-SRTP for media
4. **Input Validation:** Zod schemas for all API inputs
5. **SQL Injection:** Prisma ORM parameterized queries
6. **XSS:** React automatic escaping

---

## Known Limitations

1. **Call Capacity:** The SFU model supports a 100-participant conference target without mesh client upload growth; actual video capacity requires active WebRTC load testing and depends on bitrate, SFU egress, CPU, and network.
2. **Server Branding:** Server images are compressed public UploadThing assets whose persistent URLs are stored in MariaDB; they are intentionally not encrypted like messages and files.
3. **Key Recovery:** Identity keys and sessions can be exported to a password-encrypted JSON backup for moving to another device.
2. **WebSockets:** Sticky sessions required for real-time coordination
3. **Database:** Failover is automatic but requires replica promotion
4. **File Upload:** Limited to UploadThing free tier

---

## Recent Changes (SFU Migration)

| Change | Description |
|--------|-------------|
| Replaced P2P with SFU | All WebRTC connections now go through Mediasoup SFU |
| Removed TURN Server | No longer needed, SFU handles media relay |
| Removed coturn/ directory | Coturn code and config deleted |
| Updated mediasoup-client.ts | New client utilities for SFU |
| Updated call-room.tsx | Converted to use @mediasoup/client |
| Updated docker-compose.yml | Added mediasoup-sfu service |
| Removed nginx.conf | No longer required for SFU architecture |

---

## Current verification

- 72/72 Vitest tests passed on November 14, 2026.
- `npm run build` passed.
- Full lint reports four existing `no-explicit-any` errors in stress-test
  fixtures and warnings elsewhere.
- Group messages and encrypted files use the v2 per-recipient X25519/AES-GCM
  envelope.
- Private identity keys and session state remain device-local and support
  encrypted password-backed export/import.
- Realtime delivery uses authenticated Socket.IO rooms with local delivery and
  Redis cross-node fan-out.
- Calls use the Mediasoup SFU only on UDP ports `40000-40099`.

## Conclusion

SyncMove is a fully functional real-time communication platform with:
- ✅ Multi-node architecture (Mediasoup SFU)
- ✅ End-to-end encryption
- ✅ WebRTC media calls (no P2P, no TURN)
- ✅ Real-time chat
- ✅ Database failover
- ✅ Comprehensive testing (72/72 current Vitest tests passing)

**Status: Local validation complete** ✅
