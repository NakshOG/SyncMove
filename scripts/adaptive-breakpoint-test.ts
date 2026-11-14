import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { io } from "socket.io-client";

type Stage = {
  target: string;
  concurrency: number;
  durationSeconds: number;
  requests: number;
  successes: number;
  failures: number;
  p95Ms: number | null;
  errorRatePercent: number;
  peakCpuPercent: number;
  peakMemoryMb: number;
  stopped: boolean;
  stopReason?: string;
};

const baseUrl = process.env.LOAD_BASE_URL ?? "http://localhost:3000";
const sfuUrl = process.env.LOAD_SFU_URL ?? "http://localhost:3333";
const stageSeconds = Number(process.env.BREAKPOINT_STAGE_SECONDS ?? 5);
const increment = Number(process.env.BREAKPOINT_INCREMENT ?? 50);
const maxConcurrency = Number(process.env.BREAKPOINT_MAX_CONCURRENCY ?? 500);
const p95LimitMs = Number(process.env.BREAKPOINT_P95_LIMIT_MS ?? 2000);
const errorLimitPercent = Number(process.env.BREAKPOINT_ERROR_LIMIT_PERCENT ?? 10);
const stages: Stage[] = [];

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return Number(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * p / 100) - 1)].toFixed(2));
}

function resources() {
  try {
    const raw = execFileSync("docker", ["stats", "--no-stream", "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"], { encoding: "utf8" });
    return raw.trim().split(/\r?\n/).map((line) => {
      const [name, cpu, memory] = line.split("|");
      const usage = memory?.split("/")[0].trim().match(/([\d.]+)(MiB|GiB)/);
      return {
        name,
        cpuPercent: Number(cpu?.replace("%", "")) || 0,
        memoryMb: Number(usage?.[1] ?? 0) * (usage?.[2] === "GiB" ? 1024 : 1),
      };
    });
  } catch {
    return [];
  }
}

async function runApiStage(concurrency: number): Promise<Stage> {
  const stopAt = Date.now() + stageSeconds * 1000;
  const latencies: number[] = [];
  let requests = 0;
  let successes = 0;
  let failures = 0;
  const before = resources();
  async function worker() {
    while (Date.now() < stopAt) {
      const started = performance.now();
      requests++;
      try {
        const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
        latencies.push(performance.now() - started);
        if (response.status < 500) successes++;
        else failures++;
      } catch {
        latencies.push(performance.now() - started);
        failures++;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const after = resources();
  const p95Ms = percentile(latencies, 95);
  const errorRatePercent = requests ? Number((failures / requests * 100).toFixed(2)) : 100;
  const peakCpuPercent = Math.max(...[...before, ...after].map((item) => item.cpuPercent), 0);
  const peakMemoryMb = Math.max(...[...before, ...after].map((item) => item.memoryMb), 0);
  const stopped = Boolean((p95Ms !== null && p95Ms > p95LimitMs) || errorRatePercent > errorLimitPercent);
  return { target: "api", concurrency, durationSeconds: stageSeconds, requests, successes, failures, p95Ms, errorRatePercent, peakCpuPercent, peakMemoryMb, stopped, stopReason: stopped ? `p95>${p95LimitMs}ms or errors>${errorLimitPercent}%` : undefined };
}

async function runSocketStage(concurrency: number): Promise<Stage> {
  const before = resources();
  let connected = 0;
  let failures = 0;
  const sockets: ReturnType<typeof io>[] = [];
  await Promise.all(Array.from({ length: concurrency }, () => new Promise<void>((resolve) => {
    const socket = io(sfuUrl, { transports: ["websocket"], reconnection: false, timeout: 3000 });
    socket.once("connect", () => { connected++; sockets.push(socket); resolve(); });
    socket.once("connect_error", () => { failures++; socket.disconnect(); resolve(); });
  })));
  await new Promise((resolve) => setTimeout(resolve, stageSeconds * 1000));
  for (const socket of sockets) socket.disconnect();
  const after = resources();
  const errorRatePercent = Number((failures / concurrency * 100).toFixed(2));
  const stopped = errorRatePercent > errorLimitPercent;
  return { target: "sfu-signaling", concurrency, durationSeconds: stageSeconds, requests: concurrency, successes: connected, failures, p95Ms: null, errorRatePercent, peakCpuPercent: Math.max(...[...before, ...after].map((item) => item.cpuPercent), 0), peakMemoryMb: Math.max(...[...before, ...after].map((item) => item.memoryMb), 0), stopped, stopReason: stopped ? `connection errors>${errorLimitPercent}%` : undefined };
}

async function recover() {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  try {
    const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
    return { status: response.status, recovered: response.status < 500 };
  } catch {
    return { status: null, recovered: false };
  }
}

async function main() {
  for (const target of ["api", "sfu-signaling"]) {
    for (let concurrency = increment; concurrency <= maxConcurrency; concurrency += increment) {
      const stage = target === "api" ? await runApiStage(concurrency) : await runSocketStage(concurrency);
      stages.push(stage);
      console.log(`${target} ${concurrency}: p95=${stage.p95Ms ?? "n/a"}ms errors=${stage.errorRatePercent}% ${stage.stopped ? `STOP (${stage.stopReason})` : "continue"}`);
      if (stage.stopped) break;
      await recover();
    }
    await recover();
  }

  const result = { startedAt: new Date().toISOString(), policy: { stageSeconds, increment, maxConcurrency, p95LimitMs, errorLimitPercent }, stages, recoveryAfterFinalStage: await recover(), notes: ["Targets are pressured sequentially, not simultaneously.", "Video bandwidth requires active WebRTC producers and is not inferred from signaling sockets.", "A 3xx auth redirect is treated as a healthy responding application."] };
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/ADAPTIVE-BREAKPOINT-RESULTS.json", JSON.stringify(result, null, 2));
  writeFileSync("test-results/ADAPTIVE-BREAKPOINT-RESULTS.md", `# Adaptive Breakpoint Results\n\nThe runner increases pressure in stages and stops a target when p95 exceeds ${p95LimitMs} ms or error rate exceeds ${errorLimitPercent}%. It then waits for recovery before moving to the next target.\n\n| Target | Concurrency | Requests | Successes | Failures | p95 | Error rate | Stopped | Reason |\n|---|---:|---:|---:|---:|---:|---:|---|---|\n${stages.map((stage) => `| ${stage.target} | ${stage.concurrency} | ${stage.requests} | ${stage.successes} | ${stage.failures} | ${stage.p95Ms ?? "n/a"} ms | ${stage.errorRatePercent}% | ${stage.stopped ? "yes" : "no"} | ${stage.stopReason ?? "-"} |`).join("\n")}\n\nRaw data: ADAPTIVE-BREAKPOINT-RESULTS.json. This test does not claim video capacity without actual WebRTC media producers.\n`);
}

void main();
