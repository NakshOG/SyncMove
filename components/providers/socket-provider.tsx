"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

type SocketContextValue = { socket: Socket | null; isConnected: boolean };
const SocketContext = createContext<SocketContextValue>({ socket: null, isConnected: false });

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  useEffect(() => {
    let disposed = false;
    let instance: Socket | null = null;
    let bootstrapInFlight: Promise<void> | null = null;

    const bootstrap = async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const response = await fetch("/api/socket/io?bootstrap=1", {
            cache: "no-store",
            credentials: "same-origin",
          });
          if (response.ok) break;
        } catch {
          // Next dev can restart the Pages API while it compiles on demand.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    };

    const ensureBootstrap = () => {
      if (!bootstrapInFlight) {
        bootstrapInFlight = bootstrap().finally(() => {
          bootstrapInFlight = null;
        });
      }
      return bootstrapInFlight;
    };

    const connect = async () => {
      // The custom Pages API handler creates the Socket.IO server on first access.
      // Bootstrap it before the client starts its Engine.IO handshake.
      await ensureBootstrap();

      if (disposed) return;

      instance = io(window.location.origin, {
        path: "/socket.io",
        addTrailingSlash: false,
        autoConnect: false,
        // Establish the session over HTTP first, then upgrade when the browser
        // and the local Next server support WebSocket upgrades.
        transports: ["polling", "websocket"],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        timeout: 10000,
      });
      instance.on("connect", () => setIsConnected(true));
      instance.on("disconnect", () => setIsConnected(false));
      instance.on("connect_error", (error) => {
        setIsConnected(false);
        console.warn("SyncMove realtime connection failed:", error.message);
        void ensureBootstrap().then(() => {
          if (!disposed && instance && !instance.connected) instance.connect();
        });
      });
      setSocket(instance);
      instance.connect();
    };

    void connect();
    return () => {
      disposed = true;
      setIsConnected(false);
      setSocket(null);
      instance?.removeAllListeners();
      instance?.disconnect();
    };
  }, []);
  return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
