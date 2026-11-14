import { createClient, type RedisClientType } from "redis";

export type RedisPresenceRecord = {
  lastSeen: number;
  socketId: string;
};

const GLOBAL_PRESENCE_USERS = "syncmove:presence:users";
const globalPresenceSockets = (profileId: string) => `syncmove:presence:user:${profileId}:sockets`;

const state = globalThis as typeof globalThis & {
  __syncmoveRedisClient?: RedisClientType;
  __syncmoveRedisSubscriber?: RedisClientType;
};

function attachRedisErrorHandler(client: RedisClientType, label: string) {
  client.on("error", (error) => {
    console.error(`[redis:${label}]`, error instanceof Error ? error.message : error);
  });
  return client;
}

export const getRedisUrl = () => process.env.REDIS_URL ?? "";
export const isRedisEnabled = () => Boolean(getRedisUrl());

export async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (!state.__syncmoveRedisClient) {
    state.__syncmoveRedisClient = attachRedisErrorHandler(createClient({ url: redisUrl }), "client");
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
    state.__syncmoveRedisSubscriber = attachRedisErrorHandler(createClient({ url: redisUrl }), "subscriber");
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

export async function setGlobalPresence(profileId: string, socketId: string, online: boolean): Promise<void> {
  if (!profileId || !socketId || !isRedisEnabled()) return;
  const client = await getRedisClient();
  if (!client) return;
  const socketKey = globalPresenceSockets(profileId);
  if (online) {
    await client.sAdd(socketKey, socketId);
    await client.expire(socketKey, 120);
    await client.sAdd(GLOBAL_PRESENCE_USERS, profileId);
    return;
  }
  await client.sRem(socketKey, socketId);
  if ((await client.sCard(socketKey)) === 0) await client.sRem(GLOBAL_PRESENCE_USERS, profileId);
}

export async function getGlobalPresence(profileIds: string[]): Promise<string[]> {
  if (!profileIds.length) return [];
  if (!isRedisEnabled()) return [];
  const client = await getRedisClient();
  if (!client) return [];
  const online = await Promise.all(profileIds.map(async (profileId) =>
    (await client.sIsMember(GLOBAL_PRESENCE_USERS, profileId)) ? profileId : null,
  ));
  return online.filter((profileId): profileId is string => Boolean(profileId));
}
