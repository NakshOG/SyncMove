import type { Server as NetServer } from "http";
import type { Socket } from "net";
import type { NextApiResponse } from "next";
import type { Server as SocketIOServer } from "socket.io";

export type NextApiResponseServerIo = NextApiResponse & {
  socket: Socket & { server: NetServer & { io?: SocketIOServer } };
};
