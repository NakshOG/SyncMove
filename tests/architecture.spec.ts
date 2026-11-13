import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');

describe('deployment topology', () => {
  it('runs a multi-node app behind nginx with primary and replica databases', () => {
    const compose = fs.readFileSync(path.join(repoRoot, 'docker-compose.sfu.yml'), 'utf8');

    expect(compose).toContain('nginx:');
    expect(compose).toContain('app-node-1');
    expect(compose).toContain('app-node-2');
    expect(compose).toContain('mariadb-primary');
    expect(compose).toContain('mariadb-replica');
    expect(compose).toContain('read-only=1');
    expect(compose).toContain('3307:3306');
    expect(compose).toContain('3308:3306');
  });

  it('keeps the primary DB as the write source and replica as read-only', () => {
    const compose = fs.readFileSync(path.join(repoRoot, 'docker-compose.sfu.yml'), 'utf8');

    expect(compose).toContain('mariadb-primary');
    expect(compose).toContain('mariadb-replica');
    expect(compose).toContain('--read-only=1');
    expect(compose).toContain('DATABASE_URL: mysql://syncmove:syncmovepass@mariadb-primary:3306/syncmove');
    expect(compose).toContain('REPLICA_DATABASE_URL: mysql://syncmove:syncmovepass@mariadb-replica:3306/syncmove');
  });
});

describe('ACID / integrity contract', () => {
  it('declares unique and cascade constraints for critical write paths', () => {
    const schema = fs.readFileSync(path.join(repoRoot, 'prisma/schema.prisma'), 'utf8');

    expect(schema).toContain('String @unique');
    expect(schema).toContain('@@unique([profileId, serverId])');
    expect(schema).toContain('onDelete: Cascade');
    expect(schema).toContain('id   String     @id @default(uuid())');
  });

  it('uses explicit primary and replica database config for distributed reads', () => {
    const envSample = fs.readFileSync(path.join(repoRoot, '.env'), 'utf8');

    expect(envSample).toContain('DATABASE_URL=');
    expect(envSample).toContain('REPLICA_DATABASE_URL=');
    expect(envSample).toContain('REDIS_URL=');
    expect(envSample).toContain('MEDIASOUP_URL=');
  });
});

describe('webrtc media pipeline (Mediasoup SFU)', () => {
  it('uses Mediasoup SFU for audio/video media routing', () => {
    const callRoom = fs.readFileSync(path.join(repoRoot, 'components/chat/call-room.tsx'), 'utf8');

    // Check for Mediasoup client usage
    expect(callRoom).toContain('getUserMedia');
    expect(callRoom).toContain('mediasoup');
    expect(callRoom).toContain('Device');
    expect(callRoom).toContain('createSendTransport');
    expect(callRoom).toContain('produce');
    expect(callRoom).toContain('Consumer');
  });

  it('Mediasoup server uses WebRTC transport and SFU routing', () => {
    const server = fs.readFileSync(path.join(repoRoot, 'server/mediasoup-server.ts'), 'utf8');

    expect(server).toContain('Worker');
    expect(server).toContain('createWebRtcTransport');
    expect(server).toContain('createRouter');
    expect(server).toContain('produce');
    expect(server).toContain('consume');
  });
});
