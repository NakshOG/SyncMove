import { EventEmitter } from "node:events";

const state = globalThis as typeof globalThis & { __syncmoveRealtime?: EventEmitter };
state.__syncmoveRealtime ??= new EventEmitter();

export const realtime = state.__syncmoveRealtime;
export const publishChannelEvent = (channelId: string, event: unknown) => realtime.emit("channel-event", { channelId, event });
export const publishConversationEvent = (conversationId: string, event: unknown) => realtime.emit("conversation-event", { conversationId, event });
export const publishServerEvent = (serverId: string, event: unknown) => realtime.emit("server-event", { serverId, event });
