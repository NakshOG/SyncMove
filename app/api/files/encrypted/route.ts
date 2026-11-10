/**
 * Encrypted File Upload API Route
 * 
 * Handles encrypted file uploads via UploadThing.
 * 
 * Flow:
 * 1. Client encrypts file with AES-GCM
 * 2. Client uploads encrypted blob to this endpoint
 * 3. Server passes to UploadThing
 * 4. Returns file URL for sharing in messages
 */

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { uploadFiles } from "@/lib/uploadthing";

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const metadataJson = formData.get("metadata") as string;
    const channelId = formData.get("channelId") as string;

    if (!file || !metadataJson || !channelId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Validate channel membership
    const channel = await db.channel.findFirst({
      where: {
        id: channelId,
        server: {
          members: {
            some: { profileId: profile.id },
          },
        },
      },
    });

    if (!channel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    // Parse metadata
    const metadata = JSON.parse(metadataJson);

    // Convert File to ArrayBuffer for UploadThing
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });

    // Upload to UploadThing
    // Using the generic MessageFile endpoint (or create a dedicated EncryptedFile endpoint)
    const uploadResult = await uploadFiles("encryptedFile", {
      files: [
        {
          name: `encrypted-${Date.now()}`,
          blob,
          size: blob.size,
          type: "application/octet-stream",
        },
      ],
    });

    if (!uploadResult || uploadResult.length === 0) {
      return new NextResponse("Upload failed", { status: 500 });
    }

    const fileUrl = uploadResult[0]?.data?.ufsUrl ?? uploadResult[0]?.data?.url ?? "";

    // Create a message with the file attachment
    const member = await db.member.findFirst({
      where: {
        profileId: profile.id,
        serverId: channel.serverId,
      },
    });

    if (!member) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const message = await db.message.create({
      data: {
        content: `📎 ${metadata.fileName}`,
        fileUrl,
        channelId,
        memberId: member.id,
      },
      include: {
        member: {
          include: { profile: true },
        },
      },
    });

    // Publish real-time event
    const { publishChannelEvent } = await import("@/lib/realtime");
    publishChannelEvent(channelId, { type: "created", message });

    return NextResponse.json({
      success: true,
      url: fileUrl,
      metadata,
    });
  } catch (error) {
    console.error("[ENCRYPTED_FILE_UPLOAD] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * GET - Retrieve encrypted file metadata
 */
export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get("messageId");

    if (!messageId) {
      return new NextResponse("Message ID required", { status: 400 });
    }

    const message = await db.message.findUnique({
      where: { id: messageId },
      include: {
        member: {
          include: { profile: true },
        },
      },
    });

    if (!message) {
      return new NextResponse("Message not found", { status: 404 });
    }

    // Check if user has access to the channel/server
    const hasAccess = await db.channel.findFirst({
      where: {
        id: message.channelId,
        server: {
          members: {
            some: { profileId: profile.id },
          },
        },
      },
    });

    if (!hasAccess) {
      return new NextResponse("Access denied", { status: 403 });
    }

    return NextResponse.json({
      fileUrl: message.fileUrl,
      content: message.content,
    });
  } catch (error) {
    console.error("[ENCRYPTED_FILE_GET] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}