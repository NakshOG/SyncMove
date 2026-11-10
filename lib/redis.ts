import { createClient, type RedisClientType } from "redis";

export type RedisPresenceRecord = {
  lastSeen: number;
  socketId: string;
};

const state = globalThis as typeof globalThis & {
  __syncmoveRedisClient?: RedisClientType;
  __syncmoveRedisSubscriber?: RedisClientType;
};

export const getRedisUrl = () => process.env.REDIS_URL ?? "";
export const isRedisEnabled = () => Boolean(getRedisUrl());

export async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (!state.__syncmoveRedisClient) {
    state.__syncmoveRedisClient = createClient({ url: redisUrl });
    await state.__syncmoveRedisClient.connect();
  }

  return state.__syncmoveRedisClient;
}

export async function getRedisPubClient(): Promise<RedisClientType | null> {
  return getRedisClient();
}

export async function getRedisSubClient(): Promise<RedisClientType | null> {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (!state.__syncmoveRedisSubscriber) {
    state.__syncmoveRedisSubscriber = createClient({ url: redisUrl });
    await state.__syncmoveRedisSubscriber.connect();
  }

  return state.__syncmoveRedisSubscriber;
}

export async function getRedisSubscriber(): Promise<RedisClientType | null> {
  return getRedisSubClient();
}

export async function setServerPresence(
  serverId: string,
  profileId: string | undefined,
  online: boolean,
  socketId?: string,
  timestamp = Date.now(),
): Promise<void> {
  if (!serverId || !profileId || !isRedisEnabled()) {
    return;
  }

  const client = await getRedisClient();
  if (!client) {
    return;
  }

  const key = `syncmove:presence:${serverId}`;

  if (online) {
    await client.hSet(key, {
      [profileId]: JSON.stringify({
        lastSeen: timestamp,
        socketId: socketId ?? profileId,
      } satisfies RedisPresenceRecord),
    });
    await client.expire(key, 120);
    return;
  }

  await client.hDel(key, profileId);
  const remaining = await client.hLen(key);
  if (remaining === 0) {
    await client.del(key);
  }
}

export async function getServerPresence(serverId: string): Promise<string[]> {
  if (!serverId || !isRedisEnabled()) {
    return [];
  }

  const client = await getRedisClient();
  if (!client) {
    return [];
  }

  const entries = await client.hGetAll(`syncmove:presence:${serverId}`);

  return Object.keys(entries).filter((profileId) => {
    try {
      const value = JSON.parse(entries[profileId] ?? "null") as RedisPresenceRecord | null;
      return Boolean(value && value.lastSeen && value.socketId);
    } catch {
      return false;
    }
  });
}
