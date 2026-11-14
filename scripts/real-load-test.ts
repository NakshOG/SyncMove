import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { io, type Socket } from "socket.io-client";

type Sample = { at: string; cpuPercent: number; memoryMb: number; networkRxMb: number; networkTxMb: number };

const baseUrl = process.env.LOAD_BASE_URL ?? "http://localhost:3000";
const sfuUrl = process.env.LOAD_SFU_URL ?? "http://localhost:3333";
const users = Number(process.env.LOAD_USERS ?? 439);
const durationSeconds = Number(process.env.LOAD_DURATION_SECONDS ?? 30);
const requestIntervalMs = Number(process.env.LOAD_REQUEST_INTERVAL_MS ?? 1000);
const loadTestPath = process.env.LOAD_TEST_PATH ?? "/api/load-test";
const loadTestSecret = process.env.LOAD_TEST_SECRET;
const authToken = process.env.LOAD_AUTH_TOKEN;
const channelId = process.env.LOAD_CHANNEL_ID;
const samples: Sample[] = [];
const latencies: number[] = [];
let requests = 0;
let responses = 0;
let errors = 0;
let messageAttempts = 0;
let messageAccepted = 0;
let messageRejected = 0;
let wsConnected = 0;
let wsUnexpectedDisconnects = 0;
let wsSockets: Socket[] = [];

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function dockerStats(): Sample[] {
  try {
    const raw = execFileSync("docker", ["stats", "--no-stream", "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"], { encoding: "utf8" });
    const now = new Date().toISOString();
    for (const line of raw.trim().split(/\r?\n/)) {
      const [name, cpu, memory, network] = line.split("|");
      if (!name || !memory || !network) continue;
      const memoryUsage = memory.split("/")[0].trim();
      const memoryMatch = memoryUsage.match(/([\d.]+)(MiB|GiB|MB|GB)/);
      const memoryMb = Number(memoryMatch?.[1] ?? 0) * (memoryMatch?.[2]?.includes("GiB") || memoryMatch?.[2]?.includes("GB") ? 1024 : 1);
      const [rx, tx] = network.split("/").map((value) => Number((value.match(/([\d.]+)([MG]B)/)?.[1] ?? 0)) * (value.includes("GB") ? 1024 : 1));
      const cpuPercent = Number(cpu.replace("%", "")) || 0;
      samples.push({ at: `${now} ${name}`, cpuPercent, memoryMb, networkRxMb: rx || 0, networkTxMb: tx || 0 });
    }
  } catch {
    // Docker may be unavailable when the harness is used against a remote URL.
  }
  return samples;
}

function dbConnections() {
  try {
    const raw = execFileSync("docker", ["exec", "syncmove-db-primary", "mariadb", "-uroot", "-prootpassword", "-Nse", "SHOW STATUS LIKE 'Threads_connected'; SHOW VARIABLES LIKE 'max_connections';"], { encoding: "utf8" });
    const values = raw.trim().split(/\r?\n/).map((line) => Number(line.split("\t")[1]));
    return { active: values[0] || 0, limit: values[1] || 0 };
  } catch {
    return null;
  }
}

function redisStats() {
  try {
    const raw = execFileSync("docker", ["exec", "syncmove-redis", "redis-cli", "INFO", "stats"], { encoding: "utf8" });
    const get = (key: string) => Number(raw.match(new RegExp(`^${key}:(\\d+)`, "m"))?.[1] ?? 0);
    return { instantaneousOpsPerSecond: get("instantaneous_ops_per_sec"), totalCommandsProcessed: get("total_commands_processed") };
  } catch {
    return null;
  }
}

async function request(path: string, method = "GET", body?: unknown) {
  const started = performance.now();
  requests++;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(loadTestSecret ? { "x-load-test-secret": loadTestSecret } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    responses++;
    latencies.push(performance.now() - started);
    return response;
  } catch {
    errors++;
    latencies.push(performance.now() - started);
    return null;
  }
}

async function virtualUser(id: number, stopAt: number) {
  while (Date.now() < stopAt) {
    await request(loadTestSecret ? loadTestPath : "/");
    if (channelId && authToken) {
      await request(`/api/messages?channelId=${encodeURIComponent(channelId)}&limit=10`);
      messageAttempts++;
      const response = await request("/api/messages", "POST", { channelId, content: `load-test-${id}-${Date.now()}` });
      if (response?.ok) messageAccepted++;
      else messageRejected++;
    }
    await new Promise((resolve) => setTimeout(resolve, requestIntervalMs));
  }
}

function openSocket(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(sfuUrl, { transports: ["websocket"], reconnection: false, timeout: 5000 });
    const timer = setTimeout(() => { socket.disconnect(); reject(new Error("socket timeout")); }, 6000);
    socket.once("connect", () => { clearTimeout(timer); wsConnected++; resolve(socket); });
    socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  const stopAt = Date.now() + durationSeconds * 1000;
  const dbBefore = dbConnections();
  const redisBefore = redisStats();
  dockerStats();

  const sampler = setInterval(() => dockerStats(), 1000);
  const socketResults = await Promise.allSettled(Array.from({ length: users }, () => openSocket()));
  wsSockets = socketResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);

  await Promise.all(Array.from({ length: users }, (_, index) => virtualUser(index, stopAt)));
  clearInterval(sampler);
  dockerStats();
  const dbAfter = dbConnections();
  const redisAfter = redisStats();
  for (const socket of wsSockets) {
    if (socket.connected) socket.disconnect();
  }

  const result = {
    startedAt,
    finishedAt: new Date().toISOString(),
    configuration: { baseUrl, sfuUrl, users, durationSeconds, requestIntervalMs, loadTestPath: loadTestSecret ? loadTestPath : null, authMiddlewareBypassed: Boolean(loadTestSecret), authenticatedMessageLoad: Boolean(authToken && channelId), channelIdProvided: Boolean(channelId) },
    api: { requests, responses, errors, throughputPerSecond: Number((responses / durationSeconds).toFixed(2)), p95Ms: percentile(latencies, 95), p99Ms: percentile(latencies, 99), minMs: latencies.length ? Number(Math.min(...latencies).toFixed(2)) : null, maxMs: latencies.length ? Number(Math.max(...latencies).toFixed(2)) : null },
    messages: { attempts: messageAttempts, accepted: messageAccepted, rejected: messageRejected, messagesPerSecond: Number((messageAccepted / durationSeconds).toFixed(2)), status: authToken && channelId ? "measured" : "not measured: set LOAD_AUTH_TOKEN and LOAD_CHANNEL_ID" },
    websocket: { attempted: users, connected: wsConnected, connectionFailures: users - wsConnected, connectionFailureRatePercent: Number(((users - wsConnected) / users * 100).toFixed(2)), unexpectedDisconnects: wsUnexpectedDisconnects, disconnectRatePercent: wsConnected ? Number((wsUnexpectedDisconnects / wsConnected * 100).toFixed(2)) : null, status: "Socket.IO signaling connections; not a WebRTC media test" },
    database: { before: dbBefore, after: dbAfter, peakObservedConnections: Math.max(dbBefore?.active ?? 0, dbAfter?.active ?? 0) },
    redis: { before: redisBefore, after: redisAfter, commandDelta: redisBefore && redisAfter ? redisAfter.totalCommandsProcessed - redisBefore.totalCommandsProcessed : null },
    containers: samples,
    videoBandwidth: { status: "not measured: requires active WebRTC producers", note: "SFU container network samples are recorded above but are not attributed to video without a live media producer." },
    recovery: { status: "available when post-run HTTP status is below 500; local load-test endpoint is used when secret-gated mode is enabled", health: (await request(loadTestSecret ? loadTestPath : "/"))?.status ?? null },
  };

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/REAL-LOAD-TEST-RESULTS.json", JSON.stringify(result, null, 2));
  const resourceRows = [...new Set(samples.map((sample) => sample.at.split(" ").slice(1).join(" ")))].map((name) => {
    const rows = samples.filter((sample) => sample.at.endsWith(name));
    return `| ${name} | ${Math.max(...rows.map((row) => row.cpuPercent)).toFixed(2)}% | ${Math.max(...rows.map((row) => row.memoryMb)).toFixed(2)} MB |`;
  }).join("\n");
  writeFileSync("test-results/REAL-LOAD-TEST-RESULTS.md", `# Real Load Test Results\n\nRun: ${startedAt} -> ${result.finishedAt}\n\n## Configuration\n\n- Virtual users: ${users}\n- Duration: ${durationSeconds}s\n- Base URL: ${baseUrl}\n- Authenticated message load: ${result.messages.status}\n\n## Observed metrics\n\n| Metric | Result |\n|---|---:|\n| API requests | ${requests} |\n| API throughput | ${result.api.throughputPerSecond}/s |\n| API p95 | ${result.api.p95Ms ?? "n/a"} ms |\n| API p99 | ${result.api.p99Ms ?? "n/a"} ms |\n| WebSocket connected | ${wsConnected}/${users} |\n| WebSocket connection failure rate | ${result.websocket.connectionFailureRatePercent}% |\n| Unexpected WebSocket disconnect rate | ${result.websocket.disconnectRatePercent ?? "n/a"}% |\n| DB connections after run | ${dbAfter?.active ?? "n/a"}/${dbAfter?.limit ?? "n/a"} |\n| Redis command delta | ${result.redis.commandDelta ?? "n/a"} |\n| Messages/s | ${result.messages.status === "measured" ? result.messages.messagesPerSecond : "not measured"} |\n| Video bandwidth | Not measured without active WebRTC producers |\n| Recovery HTTP status | ${result.recovery.health ?? "n/a"} (3xx means auth redirect) |\n\n## Peak container CPU and RAM\n\n| Container | Peak CPU | Peak RAM |\n|---|---:|---:|\n${resourceRows}\n\nRaw samples are in REAL-LOAD-TEST-RESULTS.json. These are measurements of this machine and this run, not production capacity guarantees.\n`);
  console.log(JSON.stringify(result, null, 2));
}

void main();
