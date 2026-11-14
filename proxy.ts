import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// UploadThing calls this endpoint server-to-server after the browser upload.
// Its callback has a signed UploadThing payload rather than a Clerk browser
// session, so redirecting it to /sign-in turns the expected JSON into HTML.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/uploadthing(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // A secret-gated local load-test endpoint avoids Clerk redirect latency.
  // This is disabled in production and does not bypass auth for normal routes.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.LOAD_TEST_SECRET &&
    req.nextUrl.pathname === "/api/load-test" &&
    req.headers.get("x-load-test-secret") === process.env.LOAD_TEST_SECRET
  ) {
    return NextResponse.next();
  }
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|api/socket/io|socket.io|[^?]*\\.(?:html?|css|js(?!on)|png|jpg|jpeg|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Run Clerk middleware for application APIs, excluding the Socket.IO transport.
    "/api/((?!socket/io|uploadthing).*)",
  ],
};
