import type { types } from "mediasoup";

/**
 * In-memory registry of Mediasoup SFU state keyed by room (worker) id.
 *
 * Each room gets its own Router running on a shared Mediasoup Worker.
 * Transport instances created for a room are stored here so they can be
 * looked up (e.g. to connect DTLS or produce/consume media) later.
 *
 * Note: this is server-only state. The actual long-running Mediasoup SFU
 * process lives in `server/mediasoup-server.ts`; this file mirrors the same
 * shape for the Next.js API route.
 */
export const mediaSoupConfig = new Map<
  string,
  {
    worker: types.Worker;
    router: types.Router;
    transports: Map<string, types.WebRtcTransport>;
  }
>();
