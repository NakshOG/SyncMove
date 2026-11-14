/**
 * Peer Key Bundle API Route
 * 
 * Endpoints for fetching another user's key bundle to establish
 * encrypted communication.
 */

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * GET /api/keys/[userId]
 * Download a peer's key bundle for E2EE setup
 * 
 * Returns only public key material - server cannot decrypt messages
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { userId } = await params;

    // Don't allow fetching own bundle (should use GET /api/keys instead)
    if (userId === profile.id) {
      return new NextResponse("Cannot fetch own bundle", { status: 400 });
    }

    const keyBundle = await db.keyBundle.findUnique({
      where: { userId },
    });

    if (!keyBundle) {
      return new NextResponse("User has no key bundle", { status: 404 });
    }

    // Return only public key components
    return NextResponse.json({
      identityKey: keyBundle.identityKey,
      signedPreKey: keyBundle.signedPreKey,
      signature: keyBundle.signature,
      oneTimePreKeyId: keyBundle.oneTimePreKeyId,
      oneTimePreKey: keyBundle.oneTimePreKey,
      // Include timestamp for freshness verification (not sensitive)
      publishedAt: keyBundle.created,
    });
  } catch (error) {
    console.error("[PEER_KEYS_GET] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * POST /api/keys/[userId]
 * Mark a one-time pre-key as used (after using it in X3DH)
 * 
 * This ensures each OTPK is only used once.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { userId } = await params;
    const body = await req.json();
    const { oneTimePreKeyId } = body;

    if (!oneTimePreKeyId) {
      return new NextResponse("Missing oneTimePreKeyId", { status: 400 });
    }

    // Mark the OTPK as used by removing it
    await db.keyBundle.update({
      where: { userId },
      data: {
        oneTimePreKeyId: null,
        oneTimePreKey: null,
        updated: new Date(),
      },
    }).catch(() => {
      // Bundle might not exist or already used
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PEER_KEYS_POST] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
