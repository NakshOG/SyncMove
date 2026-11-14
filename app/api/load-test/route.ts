import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.LOAD_TEST_SECRET ||
    request.headers.get("x-load-test-secret") !== process.env.LOAD_TEST_SECRET
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const started = performance.now();
  await db.$queryRaw`SELECT 1 AS ok`;
  const redis = await getRedisClient();
  if (redis) await redis.incr("syncmove:load-test:requests");

  return NextResponse.json({
    ok: true,
    database: true,
    redis: Boolean(redis),
    elapsedMs: Number((performance.now() - started).toFixed(2)),
  });
}
