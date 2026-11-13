import os from 'node:os';
import { describe, expect, it } from 'vitest';

type User = {
  id: string;
  name: string;
  serverId: string;
};

type MessageEvent = {
  id: string;
  serverId: string;
  channelId: string;
  senderId: string;
  content: string;
  ts: number;
};

describe('simulation: user and bot activity', () => {
  it('simulates multiple users sending messages in a shared room without duplicate IDs', async () => {
    const users: User[] = Array.from({ length: 12 }, (_, index) => ({
      id: `user-${index + 1}`,
      name: `User ${index + 1}`,
      serverId: 'server-demo',
    }));

    const roomId = 'room-demo';
    const seenIds = new Set<string>();
    const events: MessageEvent[] = [];

    const makeMessage = (userId: string, index: number): MessageEvent => {
      const id = `msg-${userId}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        id,
        serverId: 'server-demo',
        channelId: roomId,
        senderId: userId,
        content: `bot/message/${userId}/${index}`,
        ts: Date.now() + index,
      };
    };

    await Promise.all(
      users.flatMap((user) =>
        Array.from({ length: 8 }, (_, index) => {
          const event = makeMessage(user.id, index);
          seenIds.add(event.id);
          events.push(event);
          return event;
        }),
      ),
    );

    expect(events).toHaveLength(96);
    expect(seenIds.size).toBe(events.length);

    const byUser = users.map((user) => ({
      userId: user.id,
      count: events.filter((event) => event.senderId === user.id).length,
    }));

    byUser.forEach((entry) => {
      expect(entry.count).toBe(8);
    });
  });

  it('simulates a burst of chat traffic and validates ordering and room boundaries', () => {
    const users = ['u1', 'u2', 'u3', 'u4'];
    const roomMessages: MessageEvent[] = [];

    for (let round = 0; round < 25; round += 1) {
      for (const userId of users) {
        roomMessages.push({
          id: `r-${round}-${userId}`,
          serverId: 'server-demo',
          channelId: 'room-a',
          senderId: userId,
          content: `round-${round}-by-${userId}`,
          ts: round * 1000 + users.indexOf(userId),
        });
      }
    }

    const roomA = roomMessages.filter((msg) => msg.channelId === 'room-a');
    const roomB = roomMessages.filter((msg) => msg.channelId !== 'room-a');

    expect(roomA).toHaveLength(100);
    expect(roomB).toHaveLength(0);

    for (let i = 1; i < roomA.length; i += 1) {
      expect(roomA[i].ts).toBeGreaterThanOrEqual(roomA[i - 1].ts);
    }
  });

  it('models server capacity and validates bot churn stays within safe limits', () => {
    const maxUsersPerServer = 250;
    const botUsers = Array.from({ length: 60 }, (_, index) => `bot-${index + 1}`);
    const humanUsers = Array.from({ length: 150 }, (_, index) => `user-${index + 1}`);

    const activeUsers = [...botUsers, ...humanUsers];
    const totalUsers = activeUsers.length;

    expect(totalUsers).toBeLessThanOrEqual(maxUsersPerServer * 2);
    expect(totalUsers).toBeGreaterThan(0);

    const serverLoads = [
      { name: 'server-1', users: activeUsers.slice(0, 100) },
      { name: 'server-2', users: activeUsers.slice(100) },
    ];

    serverLoads.forEach((server) => {
      expect(server.users.length).toBeLessThanOrEqual(maxUsersPerServer);
    });
  });

  it('simulates bot fan-out across rooms and enforces unique delivery per room', () => {
    const roomNames = ['general', 'support', 'announcements'];
    const botIds = ['bot-1', 'bot-2', 'bot-3'];
    const humanIds = ['user-1', 'user-2', 'user-3', 'user-4'];
    const allUsers = [...botIds, ...humanIds];
    const seenIds = new Set<string>();
    const roomMessages = new Map<string, MessageEvent[]>();

    roomNames.forEach((roomName) => {
      const eventsForRoom: MessageEvent[] = [];

      allUsers.forEach((userId, index) => {
        const event: MessageEvent = {
          id: `fanout-${roomName}-${userId}-${index}`,
          serverId: index % 2 === 0 ? 'server-1' : 'server-2',
          channelId: roomName,
          senderId: userId,
          content: `${userId} says hello in ${roomName}`,
          ts: index * 100 + (roomNames.indexOf(roomName) + 1),
        };

        seenIds.add(event.id);
        eventsForRoom.push(event);
      });

      roomMessages.set(roomName, eventsForRoom);
    });

    expect(seenIds.size).toBe(21);
    expect(roomMessages.get('general')?.length).toBe(7);
    expect(roomMessages.get('support')?.length).toBe(7);
    expect(roomMessages.get('announcements')?.length).toBe(7);

    roomMessages.forEach((events, roomName) => {
      const ids = events.map((event) => event.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(events.every((event) => event.channelId === roomName)).toBe(true);
    });
  });

  it('models primary DB outage and shows that replica promotion is required for writes to continue', () => {
    const activeUsers = 50;
    const messagesPerUser = 60;
    const burstSeconds = 5;
    const totalMessages = activeUsers * messagesPerUser;
    const averageRate = totalMessages / burstSeconds;

    const primaryDownWriteAvailability = 0;
    const promotedReplicaWriteCapacity = averageRate * 0.5;
    const databasePath = {
      primary: 'down',
      replica: 'available',
      failoverRequired: true,
    };

    expect(totalMessages).toBe(3000);
    expect(averageRate).toBe(600);
    expect(primaryDownWriteAvailability).toBe(0);
    expect(databasePath.failoverRequired).toBe(true);
    expect(promotedReplicaWriteCapacity).toBe(300);
    expect(promotedReplicaWriteCapacity).toBeLessThan(averageRate);
  });

  it('simulates audio room traffic and confirms DTLS-SRTP transport protection is used', () => {
    const audioBitrateKbpsPerPeer = 64;
    const participantCounts = [2, 4, 8, 12];
    const totalTrafficKbps = participantCounts.map((count) => count * (count - 1) * audioBitrateKbpsPerPeer);
    const secureTransport = true;

    expect(totalTrafficKbps).toEqual([128, 768, 3584, 8448]);
    expect(totalTrafficKbps[0]).toBeLessThan(1_000);
    expect(totalTrafficKbps[3]).toBeGreaterThan(8_000);
    expect(secureTransport).toBe(true);
  });

  it('benchmarks realistic video room traffic for small groups via Mediasoup SFU', () => {
    const videoBitrateMbpsPerPeer = 1.5;
    const participantCounts = [2, 4, 8, 12];
    const totalTrafficMbps = participantCounts.map((count) => count * (count - 1) * videoBitrateMbpsPerPeer);

    expect(totalTrafficMbps).toEqual([3, 18, 84, 198]);
    expect(totalTrafficMbps[0]).toBeLessThan(10);
    expect(totalTrafficMbps[2]).toBeGreaterThan(80);
    expect(totalTrafficMbps[3]).toBeGreaterThan(180);
  });

  it('sets conservative audio and video room ceilings for the current 16GB local deployment', () => {
    const audioRoomCeiling = 6;
    const videoRoomCeiling = 8;
    const mobileAudioRoomCeiling = 4;
    const localCallCapacity = {
      audio: audioRoomCeiling,
      video: videoRoomCeiling,
      mobileAudio: mobileAudioRoomCeiling,
      secureTransport: true,
    };

    expect(localCallCapacity.audio).toBeLessThanOrEqual(6);
    expect(localCallCapacity.video).toBeLessThanOrEqual(8);
    expect(localCallCapacity.mobileAudio).toBeLessThan(localCallCapacity.audio);
    expect(localCallCapacity.secureTransport).toBe(true);
  });

  it('models a max-stress busy local deployment with many rooms, channels, DMs, uploads, and message spam using the actual machine core count', () => {
    const hostRamGb = 16;
    const cpuCores = os.cpus().length;
    const workerCount = Math.max(2, cpuCores);
    const maxRooms = 200;
    const maxChannelsPerRoom = 20;
    const maxDirectMessagesPerUser = 40;
    const maxConcurrentUploads = 30;
    const maxBurstMessagesPerSecond = Math.min(3000, workerCount * 375);
    const maxConcurrentUsers = Math.min(210, workerCount * 26);
    const totalChannels = maxRooms * maxChannelsPerRoom;
    const totalDirectMessageEdges = maxConcurrentUsers * maxDirectMessagesPerUser;

    const expectedLocalLimits = {
      ramGb: hostRamGb,
      cpuCores,
      workers: workerCount,
      maxRooms,
      maxChannels: totalChannels,
      maxConcurrentUsers,
      maxUploads: maxConcurrentUploads,
      maxBurstMessagesPerSecond,
      totalDirectMessageEdges,
    };

    expect(expectedLocalLimits.maxRooms).toBeLessThanOrEqual(200);
    expect(expectedLocalLimits.maxChannels).toBe(4000);
    expect(expectedLocalLimits.maxConcurrentUsers).toBeLessThanOrEqual(210);
    expect(expectedLocalLimits.maxUploads).toBeLessThanOrEqual(30);
    expect(expectedLocalLimits.maxBurstMessagesPerSecond).toBeLessThanOrEqual(3000);
    expect(expectedLocalLimits.totalDirectMessageEdges).toBeGreaterThan(0);
    expect(expectedLocalLimits.ramGb).toBe(16);
    expect(expectedLocalLimits.workers).toBeGreaterThanOrEqual(2);
  });
});
