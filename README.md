# SyncMove

A desktop-first, zero-knowledge E2EE video chat and messaging platform built with Next.js 16, WebRTC, and Signal Protocol.

## Features

- **End-to-End Encryption** - All messages, calls, and files are encrypted client-side. Private keys never leave the device.
- **Signal Protocol** - X3DH key exchange + Double Ratchet for forward secrecy
- **Group Encryption** - Sender Keys for efficient O(1) group messaging
- **Secure File Sharing** - Compress-then-encrypt workflow before upload
- **WebRTC Video/Audio Calls** - DTLS-SRTP enforced through a Mediasoup SFU; no P2P, STUN, or TURN
- **Socket Security** - Clerk authentication, heartbeat, rate limiting, flood detection
- **Distributed Real-Time** - Socket.IO + Redis adapter for multi-instance rooms, presence, and pub/sub fanout
- **Zero-Knowledge Architecture** - Server cannot decrypt any user communications

## Tech Stack

- **Frontend**: Next.js 16, React, TailwindCSS, Lucide Icons
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: MariaDB
- **Realtime Coordination**: Socket.IO + Redis adapter + Redis pub/sub
- **Presence & Scale**: server-side TTL-based presence map with cross-instance fanout
- **Auth**: Clerk
- **File Storage**: UploadThing / S3-compatible storage
- **WebRTC**: `@mediasoup/client` with all media routed through the SFU
- **Encryption**: Web Crypto API (X3DH, Double Ratchet, AES-GCM)

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design documentation.

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Docker Deployment (Recommended)

```bash
# 1. Create a .env file in the project root
#    Example: DATABASE_URL, REDIS_URL, Clerk keys, UploadThing keys, SFU settings

# 2. Configure your environment variables in .env
#    - Database credentials
#    - Redis credentials (or local Redis URL)
#    - Clerk authentication keys
#    - UploadThing credentials
#    - Mediasoup SFU settings (no TURN settings are used)

# 3. Start all services (app, database, Redis, and Mediasoup SFU)
docker compose -f docker-compose.sfu.yml up -d --build

# 4. Access the application
#    http://localhost/
```

### Manual Development

```bash
# Install dependencies
npm install

# Configure environment
# Create a .env file and add your credentials
# Edit .env with your database, Redis, Clerk, UploadThing, and Mediasoup values

# Start database and Redis

docker run -d --name syncmove-db \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=syncmove \
  mariadb:10.11

docker run -d --name syncmove-redis \
  -p 6379:6379 \
  redis:7-alpine

# Run database migrations
npx prisma db push

# Start development server
npm run dev
```

### Local Docker stack (NGINX + two app nodes + SFU)

The recommended local runtime is the SFU Compose stack. It starts NGINX, two
Next.js app nodes, MariaDB primary/replica containers, the failover helper,
Redis, and the Mediasoup SFU:

```bash
docker compose -f docker-compose.sfu.yml up -d --build
```

The first app node runs `prisma db push` during container startup so a fresh
local database is usable even though this prototype does not ship migration
files. It does not reset the database.

Open:

- http://localhost/ (NGINX load balancer)
- http://localhost:3000/ (app node 1 direct)
- http://localhost:3001/ (app node 1 compatibility alias)
- http://localhost:3002/ (app node 2 direct)

### SFU media setup

The supported call path is Mediasoup SFU-only. Docker Compose exposes signaling on
`localhost:3333` and UDP media ports `40000-40099` by default. The browser uses
`NEXT_PUBLIC_MEDIASOUP_URL=ws://localhost:3333`; it must not use the internal
Docker hostname `mediasoup-sfu`.

## Environment Variables

| Variable                            | Description                                              | Required                                       |
| ----------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `DATABASE_URL`                      | MariaDB/MySQL connection string                          | Yes                                            |
| `REDIS_URL`                         | Redis connection string for distributed realtime scaling | No (recommended for multi-instance deployment) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key                                         | Yes                                            |
| `CLERK_SECRET_KEY`                  | Clerk secret key                                         | Yes                                            |
| `UPLOADTHING_SECRET`                | UploadThing secret key                                   | Yes                                            |
| `UPLOADTHING_APP_ID`                | UploadThing app ID                                       | Yes                                            |
| `UPLOADTHING_TOKEN`                 | UploadThing API token                                    | Yes                                            |
| `NEXT_PUBLIC_MEDIASOUP_URL`         | Browser-visible SFU WebSocket URL                        | Yes                                            |
| `MEDIASOUP_RTC_MIN_PORT`            | SFU UDP range start                                      | Yes                                            |
| `MEDIASOUP_RTC_MAX_PORT`            | SFU UDP range end                                        | Yes                                            |

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── keys/          # E2EE key bundle endpoints
│   │   ├── messages/      # Message API
│   │   ├── files/         # Encrypted file uploads
│   │   └── socket/        # Socket.IO server
│   └── (routes)/          # Page routes
├── components/
│   ├── chat/              # Call room, chat UI
│   ├── providers/         # Socket, E2EE contexts
│   ├── modals/            # UI modals
│   └── navigation/        # Navigation components
├── lib/
│   ├── e2ee/              # Encryption implementations
│   │   ├── x3dh.ts        # Key exchange
│   │   ├── double-ratchet.ts
│   │   ├── sender-key.ts  # Group encryption
│   │   └── key-storage.ts # IndexedDB storage
│   └── *.ts               # Utility libraries
├── prisma/
│   └── schema.prisma      # Database schema
├── docker-compose.sfu.yml # Local app + db + Redis + Mediasoup SFU
├── lib/redis.ts           # Redis client factory for distributed realtime
├── Dockerfile             # Application container
└── .env                   # Local environment configuration
```

## Security Model

### End-to-End Encryption

```
Alice → Bob: Encrypted with Bob's public key
Server: Cannot decrypt (no access to private keys)
```

### Key Storage

- Identity keys: IndexedDB (never localStorage)
- Session state: Encrypted, stored locally
- Private keys: Never transmitted, generated client-side

### Protocol Stack

1. **Key Exchange**: X3DH (Extended Triple Diffie-Hellman)
2. **Message Encryption**: Double Ratchet Algorithm
3. **Group Encryption**: Sender Key distribution
4. **File Encryption**: AES-GCM-256 (after compression)
5. **Transport**: WebRTC DTLS-SRTP, HTTPS/TLS

## Multi-Node Prototype Setup

For a local multi-node prototype with NGINX, Redis, and a MariaDB primary/replica setup:

```bash
cp .env.multi.example .env

docker compose -f docker-compose.sfu.yml up -d --build
```

Then open:

- http://localhost/ (NGINX load balancer)
- http://localhost:3000/ (node 1 direct)
- http://localhost:3001/ (node 1 direct)
- http://localhost:3002/ (node 2 direct)

This is a prototype for validating:

- sticky-session websocket behavior
- Socket.IO fanout across multiple app nodes
- Redis-backed realtime consistency
- primary/replica read-scaling patterns

### ACID and replica semantics

This replica is not a second source of truth.

- All writes must go to the primary database.
- The replica is for read scaling and reporting only.
- Replica lag means it is not safe for write-after-read consistency.
- Primary database remains the ACID boundary for transactions and correctness.

In other words, the prototype is intentionally simple and honest: it demonstrates how to add read scaling, but it does not weaken transactional correctness.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [TODO.md](TODO.md) - Development tracking
- [papers/ZeroKnowledgeE2EEArchitecture.md](papers/ZeroKnowledgeE2EEArchitecture.md) - E2EE design reference

## License

MIT

## Current verification

Run `npm test`, `npm run lint`, and `npm run build` for local validation. The
latest run passed all 72 Vitest tests and the production build. Full lint still
reports four existing `no-explicit-any` errors in stress-test fixtures.

The supported SFU stack is `docker-compose.sfu.yml` with Mediasoup UDP ports
`40000-40099`. Calls are SFU-only: no P2P, public STUN, TURN, or Coturn path.
Private E2EE identity keys and sessions are stored in IndexedDB; export a
password-protected backup from User Controls before clearing site data or
moving to another device.
