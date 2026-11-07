/**
 * Key Bundle API Route
 * 
 * Handles upload and management of E2EE key bundles.
 * 
 * Key bundles contain:
 * - Identity Key (public) - for verifying peer identity
 * - Signed Pre-Key (public) - medium-term key with signature
 * - One-Time Pre-Key (public) - single-use for initial handshake
 * 
 * Private keys are NEVER stored on server - only public components.
 */

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

// Validation schema for key bundle upload
const keyBundleSchema = z.object({
  identityKey: z.string().min(1),      // Base64 encoded X25519 public key
  signedPreKey: z.string().min(1),     // Base64 encoded X25519 public key
  signature: z.string().min(1),        // Base64 encoded Ed25519 signature
  oneTimePreKeyId: z.string().nullable().optional(),
  oneTimePreKey: z.string().nullable().optional(),
});

/**
 * GET /api/keys
 * Upload or update own key bundle
 */
export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    
    // Validate input
    const validationResult = keyBundleSchema.safeParse(body);
    if (!validationResult.success) {
      return new NextResponse("Invalid key bundle format", { status: 400 });
    }

    const { identityKey, signedPreKey, signature, oneTimePreKeyId, oneTimePreKey } = validationResult.data;

    // Upsert key bundle
    const keyBundle = await db.keyBundle.upsert({
      where: { userId: profile.id },
      update: {
        identityKey,
        signedPreKey,
        signature,
        oneTimePreKeyId: oneTimePreKeyId ?? null,
        oneTimePreKey: oneTimePreKey ?? null,
        updatedAt: new Date(),
      },
      create: {
        userId: profile.id,
        identityKey,
        signedPreKey,
        signature,
        oneTimePreKeyId: oneTimePreKeyId ?? null,
        oneTimePreKey: oneTimePreKey ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      keyBundleId: keyBundle.id,
    });
  } catch (error) {
    console.error("[KEYS_POST] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * GET /api/keys
 * Get own key bundle (for backup/export purposes)
 */
export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const keyBundle = await db.keyBundle.findUnique({
      where: { userId: profile.id },
    });

    if (!keyBundle) {
      return new NextResponse("No key bundle found", { status: 404 });
    }

    return NextResponse.json({
      identityKey: keyBundle.identityKey,
      signedPreKey: keyBundle.signedPreKey,
      signature: keyBundle.signature,
      oneTimePreKeyId: keyBundle.oneTimePreKeyId,
      oneTimePreKey: keyBundle.oneTimePreKey,
      createdAt: keyBundle.createdAt,
      updatedAt: keyBundle.updatedAt,
    });
  } catch (error) {
    console.error("[KEYS_GET] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * DELETE /api/keys
 * Delete own key bundle (e.g., after compromise or device reset)
 */
export async function DELETE(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await db.keyBundle.delete({
      where: { userId: profile.id },
    }).catch(() => {
      // Ignore if not found
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[KEYS_DELETE] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}