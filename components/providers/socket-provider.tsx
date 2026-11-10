"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { io, Socket } from "socket.io-client";

type SocketContextValue = {
  socket: Socket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  reconnecting: boolean;
};

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  isAuthenticated: false,
  reconnecting: false,
});

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let disposed = false;
    let bootstrapInFlight: Promise<void> | null = null;
    let pingInterval: NodeJS.Timeout | null = null;

    const clearSocket = () => {
      const current = socketRef.current;
      if (!current) return;

      current.removeAllListeners();
      current.disconnect();
      socketRef.current = null;
      setSocket(null);
    };

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
      await ensureBootstrap();

      if (disposed) return;

      if (!isLoaded || !isSignedIn) {
        clearSocket();
        setIsConnected(false);
        setIsAuthenticated(false);
        return;
      }

      const sessionToken = (await getToken()) ?? "";

      clearSocket();

      const instance = io(window.location.origin, {
        path: "/api/socket/io",
        addTrailingSlash: false,
        autoConnect: false,
        transports: ["polling", "websocket"],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        withCredentials: true,
        extraHeaders: sessionToken
          ? {
              Authorization: `Bearer ${sessionToken}`,
            }
          : undefined,
        auth: sessionToken
          ? {
              token: sessionToken,
            }
          : undefined,
      });

      socketRef.current = instance;

      instance.on("connect", () => {
        console.log("[socket] Connected:", instance.id);
        setIsConnected(true);
        setReconnecting(false);

        pingInterval = setInterval(() => {
          if (instance.connected) {
            instance.emit("ping");
          }
        }, 30000);
      });

      instance.on("disconnect", (reason) => {
        console.log("[socket] Disconnected:", instance.id, reason);
        setIsConnected(false);
        setIsAuthenticated(false);

        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
      });

      instance.on("connect_error", (error) => {
        console.warn("[socket] Connection error:", error.message);
        setIsConnected(false);

        if (!disposed) {
          void ensureBootstrap().then(() => {
            if (!disposed && instance && !instance.disconnected) {
              instance.connect();
            }
          });
        }
      });

      instance.on("reconnecting", () => {
        setReconnecting(true);
        console.log("[socket] Reconnecting...");
      });

      instance.on("reconnect", () => {
        setReconnecting(false);
        console.log("[socket] Reconnected");
      });

      instance.on(
        "authenticated",
        ({ userId }: { userId: string; socketId: string }) => {
          console.log("[socket] Authenticated as:", userId);
          setIsAuthenticated(true);
        },
      );

      instance.on("auth_error", ({ message }: { message: string }) => {
        console.warn("[socket] Auth error:", message);
        setIsAuthenticated(false);
      });

      instance.on("pong", ({ timestamp }: { timestamp: number }) => {
        const latency = Date.now() - timestamp;
        console.log(`[socket] Pong - latency: ${latency}ms`);
      });

      instance.on(
        "rate_limit",
        ({ message }: { message: string; retryAfter: number }) => {
          console.warn("[socket] Rate limited:", message);
        },
      );

      instance.on("flood_detected", ({ message }: { message: string }) => {
        console.warn("[socket] Flood detected:", message);
      });

      setSocket(instance);
      instance.connect();
    };

    void connect();

    return () => {
      disposed = true;
      setIsConnected(false);
      setIsAuthenticated(false);
      setReconnecting(false);

      if (pingInterval) {
        clearInterval(pingInterval);
      }

      clearSocket();
    };
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isAuthenticated,
        reconnecting,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

/**
 * Hook for socket connection status with auto-reconnect
 */
export function useSocketStatus() {
  const { socket, isConnected, isAuthenticated, reconnecting } = useSocket();

  const reconnect = useCallback(() => {
    if (socket && !isConnected) {
      socket.connect();
    }
  }, [socket, isConnected]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
    }
  }, [socket]);

  return {
    connected: isConnected,
    authenticated: isAuthenticated,
    reconnecting,
    reconnect,
    disconnect,
  };
}
