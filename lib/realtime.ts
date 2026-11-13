import { EventEmitter } from "node:events";
import { getRedisClient, getRedisSubscriber, isRedisEnabled } from "@/lib/redis";

const REALTIME_CHANNEL = "syncmove:realtime";

const state = globalThis as typeof globalThis & {
  __syncmoveRealtime?: EventEmitter;
  __syncmoveRedisRealtimeSubscribed?: boolean;
};

state.__syncmoveRealtime ??= new EventEmitter();

export const realtime = state.__syncmoveRealtime;

async function publishAsync(eventName: string, payload: unknown) {
  if (!isRedisEnabled()) {
    realtime.emit(eventName, payload);
    return;
  }

  const redisClient = await getRedisClient();
  if (!redisClient) {
    realtime.emit(eventName, payload);
    return;
  }

  await redisClient.publish(REALTIME_CHANNEL, JSON.stringify({ type: eventName, payload }));
}

function wireRedisSubscription() {
  if (!isRedisEnabled() || state.__syncmoveRedisRealtimeSubscribed) {
    return;
  }

  state.__syncmoveRedisRealtimeSubscribed = true;

  void getRedisSubscriber().then((subscriber) => {
    if (!subscriber) {
      return;
    }

    void subscriber.subscribe(REALTIME_CHANNEL);
    subscriber.on("message", (channel, message) => {
      if (channel !== REALTIME_CHANNEL) {
        return;
      }

      try {
        const event = JSON.parse(message) as { type?: string; payload?: unknown };
        if (event.type && event.payload !== undefined) {
          realtime.emit(event.type, event.payload);
        }
      } catch {
        // Ignore malformed Redis realtime payloads.
      }
    });
  });
}

wireRedisSubscription();

export const publishChannelEvent = (channelId: string, event: unknown) => {
  const payload = { channelId, event };
  realtime.emit("channel-event", payload);
  if (isRedisEnabled()) {
    void publishAsync("channel-event", payload);
  }
};

export const publishConversationEvent = (conversationId: string, event: unknown) => {
  const payload = { conversationId, event };
  realtime.emit("conversation-event", payload);
  if (isRedisEnabled()) {
    void publishAsync("conversation-event", payload);
  }
};

export const publishServerEvent = (serverId: string, event: unknown) => {
  const payload = { serverId, event };
  realtime.emit("server-event", payload);
  if (isRedisEnabled()) {
    void publishAsync("server-event", payload);
  }
};
