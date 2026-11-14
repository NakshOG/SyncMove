"use client";

import { UploadDropzone } from "@/lib/uploadthing";
import { X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

interface FileUploadProps {
  onChange: (url?: string) => void;
  value: string;
  endpoint: "MessageFile" | "ServerImage";
}

const compressImage = async (file: File, maxDimension: number) => {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/gif" ||
    file.type === "image/svg+xml"
  ) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );

    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
};

export const FileUpload = ({ onChange, value, endpoint }: FileUploadProps) => {
  const [localValue, setLocalValue] = useState(value);
  const [isPreviewLoading, setIsPreviewLoading] = useState(Boolean(value));
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    // Synchronize the controlled form value with the local preview state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalValue(value);
    setPreviewFailed(false);
    setIsPreviewLoading(Boolean(value));
  }, [value]);

  const isImage = endpoint === "ServerImage" && Boolean(localValue) && !previewFailed;

  if (isImage) {
    return (
      <div className="flex items-center justify-center w-full">
        <div className="relative h-24 w-24">
          <Image
            fill
            src={localValue}
            alt="File preview"
            sizes="96px"
            className="rounded-lg object-cover border-2 border-zinc-700 shadow-md"
            onLoad={() => setIsPreviewLoading(false)}
            onError={() => {
              setIsPreviewLoading(false);
              setPreviewFailed(true);
            }}
          />
          {isPreviewLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-800 rounded-lg">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"></div>
            </div>
          )}
          <button
            onClick={() => {
              setLocalValue("");
              onChange("");
            }}
            className="bg-rose-500 text-white p-1.5 rounded-full absolute -top-1.5 -right-1.5 shadow-md hover:bg-rose-600 transition-all hover:scale-110"
            type="button"
            title="Remove file"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <UploadDropzone
      endpoint={endpoint}
      onBeforeUploadBegin={(files) =>
        Promise.all(
          files.map((file) =>
            compressImage(file, endpoint === "ServerImage" ? 1024 : 1920),
          ),
        )
      }
      onClientUploadComplete={(res) => {
        const uploaded = res[0] as { url?: string; ufsUrl?: string } | undefined;
        onChange(uploaded?.ufsUrl ?? uploaded?.url);
      }}
      onUploadError={(error: Error) => {
        console.error("Upload Error:", error);
      }}
      appearance={{
        container:
          "w-full h-36 border-2 border-dashed border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800/70 rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer",
        uploadIcon: "w-7 h-7 text-zinc-400 mb-1",
        label:
          "text-xs font-medium text-zinc-300 hover:text-white transition-colors",
        allowedContent: "text-[11px] text-zinc-500 font-normal mt-0.5",
        button:
          "bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-all ut-readying:bg-indigo-600/50 ut-uploading:bg-indigo-600/50 cursor-pointer",
      }}
    />
  );
};
