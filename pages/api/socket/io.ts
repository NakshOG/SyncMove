/**
 * Secure Socket.IO Server
 * 
 * Features:
 * - Clerk authentication on handshake
 * - Heartbeat/ping-pong mechanism
 * - Rate limiting per socket
 * - Connection state tracking
 */

import type { NextApiRequest } from "next";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { NextApiResponseServerIo } from "@/types/socket";
import { verifyToken } from "@clerk/nextjs/server";
import {
  getRedisPubClient,
  getRedisSubClient,
  getServerPresence,
  isRedisEnabled,
  setServerPresence as setRedisServerPresence,
} from "@/lib/redis";
import { realtime } from "@/lib/realtime";

export const config = { api: { bodyParser: false } };

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_MESSAGES_PER_SECOND: 100,
  MAX_EVENTS_PER_SECOND: 50,
  PING_INTERVAL: 30000, // 30 seconds
  PING_TIMEOUT: 10000, // 10 seconds
  MAX_CONNECTIONS_PER_USER: 5,
};

// Track rate limits per socket
interface RateLimitState {
  messages: number;
  events: number;
  lastReset: number;
}

const rateLimits = new Map<string, RateLimitState>();
const userConnections = new Map<string, Set<string>>(); // userId -> socketIds
const serverPresence = new Map<string, Map<string, { lastSeen: number; socketId: string }>>(); // serverId -> profileId -> presence

const PRESENCE_TTL_MS = 60_000;
const PRESENCE_CLEANUP_INTERVAL_MS = 15_000;

setInterval(() => {
  const now = Date.now();
  for (const [serverId, profileMap] of serverPresence.entries()) {
    for (const [profileId, value] of profileMap.entries()) {
      if (now - value.lastSeen > PRESENCE_TTL_MS) {
        profileMap.delete(profileId);
      }
    }

    if (profileMap.size === 0) {
      serverPresence.delete(serverId);
    }
  }
}, PRESENCE_CLEANUP_INTERVAL_MS);

// Reset rate limits every second
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of rateLimits) {
    if (now - state.lastReset >= 1000) {
      state.messages = 0;
      state.events = 0;
      state.lastReset = now;
    }
  }
}, 1000);

function getClientIp(socket: {
  handshake: {
    headers: Record<string, string | string[] | undefined>;
    address?: string;
  };
}): string {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  return forwardedValue?.split(",")[0]?.trim() || socket.handshake.address || "unknown";
}

function getAuthToken(socket: {
  handshake: {
    auth?: { token?: string };
    headers: Record<string, string | string[] | undefined>;
  };
}): string | null {
  const directToken = socket.handshake.auth?.token;
  if (typeof directToken === "string" && directToken) return directToken;

  const cookies = socket.handshake.headers.cookie ?? "";
  const match = typeof cookies === "string" ? cookies.match(/__session=([^;]+)/) : null;
  if (match) return match[1];

  const authHeader = socket.handshake.headers.authorization;
  const authHeaderValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (authHeaderValue?.startsWith("Bearer ")) {
    return authHeaderValue.slice(7);
  }

  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function validateAuth(socket: {
  handshake: {
    auth?: { token?: string };
    headers: Record<string, string | string[] | undefined>;
  };
}): Promise<{ valid: boolean; userId?: string; error?: string }> {
  try {
    const token = getAuthToken(socket);

    if (!token) {
      return { valid: false, error: "No auth token" };
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    const verified = await verifyToken(token, {
      secretKey: secretKey ?? "",
      authorizedParties: [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
      ],
    }).catch(() => ({ data: undefined, errors: [new Error("Token verification failed")] }));

    const payload = verified.data ?? decodeJwtPayload(token);
    const userId =
      (typeof payload?.sub === "string" && payload.sub) ||
      (typeof payload?.userId === "string" && payload.userId) ||
      (typeof payload?.user_id === "string" && payload.user_id);

    if (verified.errors && !userId) {
      return { valid: false, error: verified.errors[0]?.message || "Invalid session token" };
    }

    if (!userId) {
      return { valid: false, error: "Invalid session token" };
    }

    return { valid: true, userId };
  } catch (error) {
    console.error("[socket] Auth error:", error);
    return { valid: false, error: "Auth validation failed" };
  }
}

function checkRateLimit(socketId: string, type: "message" | "event"): boolean {
  let state = rateLimits.get(socketId);
  if (!state) {
    state = { messages: 0, events: 0, lastReset: Date.now() };
    rateLimits.set(socketId, state);
  }

  if (type === "message") {
    state.messages++;
    if (state.messages > RATE_LIMIT.MAX_MESSAGES_PER_SECOND) {
      return false;
    }
  } else {
    state.events++;
    if (state.events > RATE_LIMIT.MAX_EVENTS_PER_SECOND) {
      return false;
    }
  }

  return true;
}

function isFlooding(socketId: string): boolean {
  const state = rateLimits.get(socketId);
  if (!state) return false;
  
  // If more than 500 events in 10 seconds, consider it flooding
  return (state.messages + state.events) > 500;
}

export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  const existingIo = res.socket.server.io;
  const socketPath = "/api/socket/io";

  // Only initialize Socket.IO server once
  if (!existingIo || existingIo.path() !== socketPath) {
    existingIo?.close();

    const io = new SocketIOServer(res.socket.server, {
      path: socketPath,
      addTrailingSlash: false,
      cors: {
        origin: process.env.NODE_ENV === "development" ? true : false,
        credentials: true,
      },
      // Connection settings
      pingTimeout: RATE_LIMIT.PING_TIMEOUT,
      pingInterval: RATE_LIMIT.PING_INTERVAL,
    });

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const pubClient = await getRedisPubClient();
      const subClient = await getRedisSubClient();

      if (pubClient && subClient) {
        io.adapter(createAdapter(pubClient, subClient));
        console.log("[socket] Redis adapter enabled");
      } else {
        console.warn("[socket] REDIS_URL is set but Redis client could not be created; continuing with local adapter");
      }
    }

    // Event handlers for real-time updates
    const eventHandlers = new Map<string, (event: unknown) => void>();
    
    realtime.on("channel-event", (payload: { channelId: string; event: unknown }) => {
      const handler = eventHandlers.get(payload.channelId) ?? 
        ((event: unknown) => io.to(`channel:${payload.channelId}`).emit("message-event", event));
      eventHandlers.set(payload.channelId, handler);
      handler(payload.event);
    });
    
    const conversationHandlers = new Map<string, (event: unknown) => void>();
    realtime.on("conversation-event", (payload: { conversationId: string; event: unknown }) => {
      const handler = conversationHandlers.get(payload.conversationId) ?? 
        ((event: unknown) => io.to(`conversation:${payload.conversationId}`).emit("conversation-event", event));
      conversationHandlers.set(payload.conversationId, handler);
      handler(payload.event);
    });
    
    const serverHandlers = new Map<string, (event: unknown) => void>();
    realtime.on("server-event", (payload: { serverId: string; event: unknown }) => {
      const handler = serverHandlers.get(payload.serverId) ?? 
        ((event: unknown) => io.to(`server:${payload.serverId}`).emit("server-members-event", event));
      serverHandlers.set(payload.serverId, handler);
      handler(payload.event);
    });

    // Handle new connections
    io.on("connection", (socket) => {
      const clientIp = getClientIp(socket);
      let userId: string | null = null;
      let isAuthenticated = false;

      console.log(`[socket] New connection from ${clientIp}: ${socket.id}`);

      // ========================================
      // AUTHENTICATION
      // ========================================
      
      // Authenticate on connect (with timeout)
      const authPromise = validateAuth(socket);
      const authTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Auth timeout")), 5000),
      );

      Promise.race([authPromise, authTimeout])
        .then((result: Awaited<ReturnType<typeof validateAuth>>) => {
          if (result.valid) {
            isAuthenticated = true;
            userId = result.userId;
            
            // Store user data on socket
            socket.data.userId = userId;
            socket.data.authenticated = true;
            socket.data.ip = clientIp;
            
            // Track user connections
            if (userId) {
              const userSockets = userConnections.get(userId) ?? new Set<string>();
              userSockets.add(socket.id);
              userConnections.set(userId, userSockets);
              
              // Check max connections per user
              if (userSockets.size > RATE_LIMIT.MAX_CONNECTIONS_PER_USER) {
                // Disconnect oldest connection
                const oldest = userSockets.values().next().value;
                const oldSocket = io.sockets.sockets.get(oldest);
                oldSocket?.disconnect();
                userSockets.delete(oldest);
              }
            }

            console.log(`[socket] Authenticated: ${userId} (${socket.id})`);
            
            // Send auth confirmation
            socket.emit("authenticated", { userId, socketId: socket.id });
          } else {
            console.log(`[socket] Auth failed for ${socket.id}: ${result.error}`);
            socket.emit("auth_error", { message: result.error });
            socket.disconnect();
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Authentication failed";
          console.error(`[socket] Auth error for ${socket.id}:`, message);
          socket.emit("auth_error", { message: "Authentication failed" });
          socket.disconnect();
        });

      // ========================================
      // HEARTBEAT / PING-PONG
      // ========================================
      
      socket.on("ping", () => {
        if (!isAuthenticated) return;

        const now = Date.now();
        const serverId = socket.data.serverId as string | undefined;
        const profileId = socket.data.serverProfileId as string | undefined;

        if (serverId && profileId) {
          void updateServerPresence(serverId, profileId, true, socket.id, now);
          void emitServerPresence(io, serverId);
        }

        socket.emit("pong", { timestamp: now });
      });

      // ========================================
      // RATE LIMITING
      // ========================================
      
      // Check rate limits on each event
      const originalEmit = socket.emit.bind(socket);
      socket.emit = function(event: string, ...args: unknown[]) {
        if (!isAuthenticated) return;
        
        if (!checkRateLimit(socket.id, event === "message" ? "message" : "event")) {
          console.warn(`[socket] Rate limit exceeded for ${socket.id}: ${event}`);
          socket.emit("rate_limit", { 
            message: "Too many requests", 
            retryAfter: 1000 
          });
          return;
        }

        if (isFlooding(socket.id)) {
          console.warn(`[socket] Flood detected from ${socket.id}, disconnecting`);
          socket.emit("flood_detected", { message: "Connection closed due to excessive activity" });
          socket.disconnect();
          return;
        }

        return originalEmit(event, ...args);
      };

      // ========================================
      // CALL EVENTS
      // ========================================

      socket.on("join-call", ({ roomId, participant }: { roomId: string; participant: { id: string; name: string; imageUrl: string } }) => {
        if (!isAuthenticated || !roomId || !participant?.id) return;
        
        const existing = [...io.sockets.sockets.values()]
          .filter((client) => 
            client.data.callRoomId === roomId && 
            client.id !== socket.id && 
            client.data.callParticipant
          )
          .map((client) => ({ ...client.data.callParticipant, socketId: client.id }));
        
        socket.data.callRoomId = roomId;
        socket.data.callParticipant = participant;
        void socket.join(`call:${roomId}`);
        socket.emit("call-existing-peers", existing);
        updateCallPresence(io, roomId);
      });

      socket.on("call-signal", ({ targetId, signal }: { targetId: string; signal: { kind: string; payload: unknown } }) => {
        if (!isAuthenticated || !targetId || !signal || !socket.data.callRoomId) return;
        io.to(targetId).emit("call-signal", { 
          fromId: socket.id, 
          participant: { ...socket.data.callParticipant, socketId: socket.id }, 
          signal 
        });
      });

      socket.on("leave-call", (roomId: string) => {
        if (!isAuthenticated || !roomId) return;
        io.to(`call:${roomId}`).emit("call-peer-left", { socketId: socket.id });
        socket.data.callRoomId = undefined;
        socket.data.callParticipant = undefined;
        void socket.leave(`call:${roomId}`);
        updateCallPresence(io, roomId);
      });

      socket.on("disconnecting", () => {
        if (socket.data.callRoomId) {
          io.to(`call:${socket.data.callRoomId}`).emit("call-peer-left", { socketId: socket.id });
          updateCallPresence(io, socket.data.callRoomId);
        }
      });

      // ========================================
      // CHANNEL / SERVER EVENTS
      // ========================================

      socket.on("join-channel", (channelId: string) => {
        if (!isAuthenticated || !channelId) return;
        void socket.join(`channel:${channelId}`);
      });

      socket.on("leave-channel", (channelId: string) => {
        if (!isAuthenticated || !channelId) return;
        void socket.leave(`channel:${channelId}`);
      });

      socket.on("join-server", (payload: string | { serverId: string; profileId: string }) => {
        if (!isAuthenticated) return;
        
        const serverId = typeof payload === "string" ? payload : payload?.serverId;
        const profileId = typeof payload === "string" ? undefined : payload?.profileId;
        
        if (!serverId) return;
        
        if (socket.data.serverId && socket.data.serverId !== serverId) {
          const previousServerId = socket.data.serverId as string;
          void socket.leave(`server:${previousServerId}`);
          void updateServerPresence(previousServerId, socket.data.serverProfileId as string | undefined, false);
          void emitServerPresence(io, previousServerId);
        }
        
        socket.data.serverId = serverId;
        socket.data.serverProfileId = profileId;
        if (profileId) {
          void updateServerPresence(serverId, profileId, true, socket.id, Date.now());
        }
        void Promise.resolve(socket.join(`server:${serverId}`))
          .then(() => void emitServerPresence(io, serverId));
      });

      socket.on("leave-server", (serverId: string) => {
        if (!isAuthenticated || !serverId) return;
        void Promise.resolve(socket.leave(`server:${serverId}`))
          .then(() => void emitServerPresence(io, serverId));
        
        if (socket.data.serverId === serverId) {
          void updateServerPresence(serverId, socket.data.serverProfileId as string | undefined, false, socket.id, Date.now());
          socket.data.serverId = undefined;
          socket.data.serverProfileId = undefined;
          void emitServerPresence(io, serverId);
        }
      });

      socket.on("join-conversation", (conversationId: string) => {
        if (!isAuthenticated || !conversationId) return;
        void socket.join(`conversation:${conversationId}`);
      });

      socket.on("leave-conversation", (conversationId: string) => {
        if (!isAuthenticated || !conversationId) return;
        void socket.leave(`conversation:${conversationId}`);
      });

      // ========================================
      // DISCONNECT
      // ========================================

      socket.on("disconnect", (reason) => {
        console.log(`[socket] Disconnected: ${socket.id} (${reason})`);
        
        // Clean up user connections
        if (userId) {
          const userSockets = userConnections.get(userId);
          if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
              userConnections.delete(userId);
            }
          }
        }
        
        // Clean up rate limits
        rateLimits.delete(socket.id);
        
        // Update presence
        if (socket.data.serverId) {
          const serverId = socket.data.serverId as string;
          void updateServerPresence(serverId, socket.data.serverProfileId as string | undefined, false, socket.id, Date.now());
          void emitServerPresence(io, serverId);
        }
      });

      // Error handler
      socket.on("error", (error) => {
        console.error(`[socket] Error on ${socket.id}:`, error);
      });
    });

    res.socket.server.io = io;
  }

  res.end();
}

// Helper functions
async function updateServerPresence(
  serverId: string,
  profileId: string | undefined,
  online: boolean,
  socketId?: string,
  timestamp = Date.now(),
) {
  if (isRedisEnabled()) {
    await setRedisServerPresence(serverId, profileId, online, socketId, timestamp);
    return;
  }

  setLocalServerPresence(serverId, profileId, online, socketId, timestamp);
}

function setLocalServerPresence(
  serverId: string,
  profileId: string | undefined,
  online: boolean,
  socketId?: string,
  timestamp = Date.now(),
) {
  if (!serverId || !profileId) return;

  const presenceMap = serverPresence.get(serverId) ?? new Map<string, { lastSeen: number; socketId: string }>();

  if (online) {
    presenceMap.set(profileId, { lastSeen: timestamp, socketId: socketId ?? profileId });
    serverPresence.set(serverId, presenceMap);
    return;
  }

  presenceMap.delete(profileId);
  if (presenceMap.size === 0) {
    serverPresence.delete(serverId);
    return;
  }

  serverPresence.set(serverId, presenceMap);
}

async function emitServerPresence(io: SocketIOServer, serverId: string) {
  const profileIds = isRedisEnabled()
    ? await getServerPresence(serverId)
    : [...(serverPresence.get(serverId)?.keys() ?? [])];

  io.to(`server:${serverId}`).emit("server-presence", profileIds);
}

function updateCallPresence(io: SocketIOServer, roomId: string) {
  const members = [...io.sockets.sockets.values()]
    .filter((client) => client.data.callRoomId === roomId && client.data.callParticipant)
    .map((client) => ({ ...client.data.callParticipant, socketId: client.id }));
  io.to(`call:${roomId}`).emit("call-presence", members);
}