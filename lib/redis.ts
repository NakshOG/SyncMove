import { createClient, type RedisClientType } from "redis";

const state = globalThis as typeof globalThis & {
  __syncmoveRedisClient?: RedisClientType;
  __syncmoveRedisSubscriber?: RedisClientType;
};

export const getRedisUrl = () => process.env.REDIS_URL ?? "";
export const isRedisEnabled = () => Boolean(process.env.REDIS_URL);

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

export async function getRedisSubscriber(): Promise<RedisClientType | null> {
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
