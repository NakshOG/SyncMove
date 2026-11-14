import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// UploadThing calls this endpoint server-to-server after the browser upload.
// Its callback has a signed UploadThing payload rather than a Clerk browser
// session, so redirecting it to /sign-in turns the expected JSON into HTML.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/uploadthing(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
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
