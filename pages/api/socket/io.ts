import type { NextApiRequest } from "next";
import { Server as SocketIOServer } from "socket.io";
import type { NextApiResponseServerIo } from "@/types/socket";
import { auth } from "@clerk/nextjs/server";
import { realtime } from "@/lib/realtime";

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  const existingIo = res.socket.server.io;
  const socketPath = "/socket.io";

  // Next development HMR can preserve the HTTP server between code changes.
  // Replace an older Socket.IO instance that was mounted at the previous
  // `/api/socket/io` transport path.
  if (!existingIo || existingIo.path() !== socketPath) {
    existingIo?.close();
    // Keep the bootstrap API route separate from Engine.IO traffic. Sharing a
    // Next API path with long-poll/WebSocket requests can cause xhr poll errors
    // in development as Next tries to finish the API response itself.
    const io = new SocketIOServer(res.socket.server, {
      path: socketPath,
      addTrailingSlash: false,
      cors: {
        // Development may be opened through localhost, 127.0.0.1, or a LAN
        // address. Production should use the same-origin default instead.
        origin: process.env.NODE_ENV === "development" ? true : false,
        credentials: true,
      },
    });
    const eventHandlers = new Map<string, (event: unknown) => void>();
    realtime.on("channel-event", (payload: { channelId: string; event: unknown }) => {
      const handler = eventHandlers.get(payload.channelId) ?? ((event: unknown) => io.to(`channel:${payload.channelId}`).emit("message-event", event));
      eventHandlers.set(payload.channelId, handler);
      handler(payload.event);
    });
    const conversationHandlers = new Map<string, (event: unknown) => void>();
    realtime.on("conversation-event", (payload: { conversationId: string; event: unknown }) => {
      const handler = conversationHandlers.get(payload.conversationId) ?? ((event: unknown) => io.to(`conversation:${payload.conversationId}`).emit("conversation-event", event));
      conversationHandlers.set(payload.conversationId, handler);
      handler(payload.event);
    });
    const serverHandlers = new Map<string, (event: unknown) => void>();
    realtime.on("server-event", (payload: { serverId: string; event: unknown }) => {
      const handler = serverHandlers.get(payload.serverId) ?? ((event: unknown) => io.to(`server:${payload.serverId}`).emit("server-members-event", event));
      serverHandlers.set(payload.serverId, handler);
      handler(payload.event);
    });
    io.on("connection", (socket) => {
      if (process.env.NODE_ENV === "development") {
        console.log("[socket] connected", socket.id);
        socket.on("disconnect", (reason) => console.log("[socket] disconnected", socket.id, reason));
      }
      const updateServerPresence = (serverId: string) => {
        const profileIds = [...new Set(
          [...io.sockets.sockets.values()]
            .filter((client) => client.data.serverId === serverId && client.data.serverProfileId)
            .map((client) => client.data.serverProfileId as string),
        )];
        io.to(`server:${serverId}`).emit("server-presence", profileIds);
      };
      const updateCallPresence = (roomId: string) => {
        const members = [...io.sockets.sockets.values()]
          .filter((client) => client.data.callRoomId === roomId && client.data.callParticipant)
          .map((client) => ({ ...client.data.callParticipant, socketId: client.id }));
        io.to(`call:${roomId}`).emit("call-presence", members);
      };
      socket.on("join-call", ({ roomId, participant }: { roomId: string; participant: { id: string; name: string; imageUrl: string } }) => {
        if (!roomId || !participant?.id) return;
        const existing = [...io.sockets.sockets.values()]
          .filter((client) => client.data.callRoomId === roomId && client.id !== socket.id && client.data.callParticipant)
          .map((client) => ({ ...client.data.callParticipant, socketId: client.id }));
        socket.data.callRoomId = roomId;
        socket.data.callParticipant = participant;
        void socket.join(`call:${roomId}`);
        socket.emit("call-existing-peers", existing);
        updateCallPresence(roomId);
      });
      socket.on("call-signal", ({ targetId, signal }: { targetId: string; signal: { kind: string; payload: unknown } }) => {
        if (!targetId || !signal || !socket.data.callRoomId) return;
        io.to(targetId).emit("call-signal", { fromId: socket.id, participant: { ...socket.data.callParticipant, socketId: socket.id }, signal });
      });
      socket.on("call-peer-left", (roomId: string) => {
        if (roomId) io.to(`call:${roomId}`).emit("call-peer-left", { socketId: socket.id });
      });
      socket.on("leave-call", (roomId: string) => {
        if (!roomId) return;
        io.to(`call:${roomId}`).emit("call-peer-left", { socketId: socket.id });
        socket.data.callRoomId = undefined;
        socket.data.callParticipant = undefined;
        void socket.leave(`call:${roomId}`);
        updateCallPresence(roomId);
      });
      socket.on("disconnecting", () => {
        if (socket.data.callRoomId) {
          io.to(`call:${socket.data.callRoomId}`).emit("call-peer-left", { socketId: socket.id });
          updateCallPresence(socket.data.callRoomId);
        }
      });
      socket.on("join-channel", (channelId: string) => {
        if (channelId) void socket.join(`channel:${channelId}`);
      });
      socket.on("leave-channel", (channelId: string) => {
        if (channelId) void socket.leave(`channel:${channelId}`);
      });
      socket.on("join-server", (payload: string | { serverId: string; profileId: string }) => {
        const serverId = typeof payload === "string" ? payload : payload?.serverId;
        const profileId = typeof payload === "string" ? undefined : payload?.profileId;
        if (!serverId) return;
        if (socket.data.serverId && socket.data.serverId !== serverId) {
          const previousServerId = socket.data.serverId as string;
          void socket.leave(`server:${previousServerId}`);
          updateServerPresence(previousServerId);
        }
        socket.data.serverId = serverId;
        socket.data.serverProfileId = profileId;
        void Promise.resolve(socket.join(`server:${serverId}`)).then(() => updateServerPresence(serverId));
      });
      socket.on("leave-server", (serverId: string) => {
        if (serverId) {
          void Promise.resolve(socket.leave(`server:${serverId}`)).then(() => updateServerPresence(serverId));
          if (socket.data.serverId === serverId) {
            socket.data.serverId = undefined;
            socket.data.serverProfileId = undefined;
          }
        }
      });
      socket.on("join-conversation", (conversationId: string) => { if (conversationId) void socket.join(`conversation:${conversationId}`); });
      socket.on("leave-conversation", (conversationId: string) => { if (conversationId) void socket.leave(`conversation:${conversationId}`); });
      socket.on("disconnect", () => {
        if (socket.data.serverId) updateServerPresence(socket.data.serverId as string);
      });
    });
    res.socket.server.io = io;
  }
  try { await auth(); } catch { /* Socket authentication is enforced by the data APIs. */ }
  res.end();
}
