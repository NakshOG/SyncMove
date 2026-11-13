"use client";

import { useState, useCallback } from "react";
// NOTE: lucide's `File` icon is renamed so it does not shadow the global `File` type
// used in useState<File | null>.
import { File as FileIcon, Lock, Unlock, Upload, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { encryptFile } from "@/lib/e2ee/file-encryption";

interface EncryptedFileUploadProps {
  channelId: string;
  onUploadComplete: (fileUrl: string, metadata: FileMetadata) => void;
  recipients?: string[]; // User IDs who can decrypt
  accept?: string;
  maxSize?: number; // in bytes
}

interface FileMetadata {
  fileName: string;
  mimeType: string;
  originalSize: number;
  encryptedSize: number;
  iv: string;
  keyId: string;
  compressed: boolean;
}

type UploadState = "idle" | "encrypting" | "uploading" | "complete" | "error";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EncryptedFileUpload({
  channelId,
  onUploadComplete,
  accept = "*/*",
  maxSize = 100 * 1024 * 1024, // 100MB default
}: EncryptedFileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset the input so choosing the same file again still fires onChange.
      event.target.value = "";
      if (!file) return;

      if (file.size > maxSize) {
        setError(`File too large. Maximum size is ${formatFileSize(maxSize)}`);
        return;
      }

      setSelectedFile(file);
      setError(null);
      setProgress(0);
      setMetadata(null);
      setUploadState("idle");
    },
    [maxSize],
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    try {
      setError(null);
      setUploadState("encrypting");
      setProgress(10);

      // Encrypt the file in the browser before anything leaves the device
      const result = await encryptFile(selectedFile);
      setProgress(50);

      // Upload to our API (which handles UploadThing)
      const formData = new FormData();
      formData.append("file", result.encryptedBlob, "encrypted");
      formData.append("metadata", JSON.stringify(result.metadata));
      formData.append("channelId", channelId);

      setUploadState("uploading");
      setProgress(70);

      const response = await fetch("/api/files/encrypted", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();

      setMetadata(data.metadata);
      setProgress(100);
      setUploadState("complete");

      // Notify parent
      onUploadComplete(data.url, data.metadata);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploadState("error");
    }
  }, [selectedFile, channelId, onUploadComplete]);

  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    setProgress(0);
    setMetadata(null);
    setUploadState("idle");
  }, []);

  const inProgress = uploadState === "encrypting" || uploadState === "uploading";

  return (
    <div className="rounded-xl border border-white/5 bg-[#2b2d31] p-4">
      {/* Step 1: no file chosen yet */}
      {!selectedFile && (
        <div className="flex flex-col items-center justify-center">
          <div className="mb-4 rounded-full bg-[#5865f2]/20 p-4">
            <Lock className="h-8 w-8 text-[#a5b4fc]" />
          </div>

          <p className="mb-4 text-center text-sm text-[#949ba4]">
            Files are encrypted before upload. Only members with access can
            decrypt.
          </p>

          <label className="cursor-pointer">
            <input
              type="file"
              accept={accept}
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex items-center gap-2 rounded-xl bg-[#5865f2] px-6 py-2 text-white transition-colors hover:bg-[#4752c4]">
              <Upload className="h-4 w-4" />
              Choose File
            </div>
          </label>

          {error && <p className="mt-3 text-sm text-[#f23f42]">{error}</p>}
        </div>
      )}

      {/* Step 2: file chosen -> review, upload, progress, result */}
      {selectedFile && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#383a40] p-2">
              <FileIcon className="h-5 w-5 text-[#b5bac1]" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {selectedFile.name}
              </p>
              <p className="text-xs text-[#949ba4]">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>

            {uploadState === "complete" ? (
              <Check className="h-5 w-5 text-[#23a559]" />
            ) : uploadState === "error" ? (
              <X className="h-5 w-5 text-[#f23f42]" />
            ) : (
              <Lock className="h-5 w-5 text-[#a5b4fc]" />
            )}
          </div>

          {inProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[#949ba4]">
                  {uploadState === "encrypting" ? "Encrypting..." : "Uploading..."}
                </span>
                <span className="text-[#949ba4]">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1" />
            </div>
          )}

          {error && <p className="text-sm text-[#f23f42]">{error}</p>}

          {metadata && (
            <div className="rounded-lg bg-[#111214] p-3 text-xs">
              <div className="mb-2 flex items-center gap-2 text-[#23a559]">
                <Check className="h-4 w-4" />
                <span className="font-medium">Encrypted successfully</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[#949ba4]">
                <div>Original: {formatFileSize(metadata.originalSize)}</div>
                <div>Encrypted: {formatFileSize(metadata.encryptedSize)}</div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {uploadState === "complete" ? (
              <Button variant="outline" onClick={handleCancel} className="rounded-xl">
                Upload Another
              </Button>
            ) : uploadState === "error" ? (
              <>
                <Button variant="ghost" onClick={handleCancel} className="rounded-xl hover:bg-[#35373c]">
                  Cancel
                </Button>
                <Button onClick={handleUpload} className="rounded-xl bg-[#5865f2] hover:bg-[#4752c4]">
                  Retry
                </Button>
              </>
            ) : uploadState === "idle" ? (
              <>
                <Button variant="ghost" onClick={handleCancel} className="rounded-xl hover:bg-[#35373c]">
                  Cancel
                </Button>
                <Button onClick={handleUpload} className="rounded-xl bg-[#5865f2] hover:bg-[#4752c4]">
                  Encrypt & Upload
                </Button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Encrypted File Download Component
 *
 * Decrypts and downloads files shared in chat.
 */

interface EncryptedFileDownloadProps {
  fileUrl: string;
  metadata: FileMetadata;
  fileName: string;
}

export function EncryptedFileDownload({
  fileUrl,
  metadata,
  fileName,
}: EncryptedFileDownloadProps) {
  const [downloadState, setDownloadState] = useState<
    "idle" | "downloading" | "decrypting" | "complete" | "error"
  >("idle");
  const [, setProgress] = useState(0);
  const [, setError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    try {
      setDownloadState("downloading");
      setProgress(10);

      // Download encrypted file
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Download failed");

      const encryptedBlob = await response.blob();
      setProgress(50);

      setDownloadState("decrypting");

      // TODO: this does NOT decrypt yet. It saves the ciphertext under the original
      // name/type. Replace with the real decrypt call from "@/lib/e2ee/file-encryption"
      // using the file key (looked up via metadata.keyId) and metadata.iv.
      const encryptedData = new Uint8Array(await encryptedBlob.arrayBuffer());

      setProgress(80);

      // Create download
      const decryptedBlob = new Blob([encryptedData], {
        type: metadata.mimeType,
      });
      const url = URL.createObjectURL(decryptedBlob);

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setDownloadState("complete");
    } catch (err) {
      console.error("Download error:", err);
      setError(err instanceof Error ? err.message : "Download failed");
      setDownloadState("error");
    }
  }, [fileUrl, metadata, fileName]);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-[#2b2d31] p-3 transition-colors hover:bg-[#35373c]">
      <div className="rounded-lg bg-[#5865f2]/20 p-2">
        <Unlock className="h-5 w-5 text-[#a5b4fc]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{fileName}</p>
        <p className="text-xs text-[#949ba4]">
          {formatFileSize(metadata.encryptedSize)} · Encrypted
        </p>
      </div>

      <Button
        onClick={handleDownload}
        disabled={downloadState === "downloading" || downloadState === "decrypting"}
        className="rounded-xl bg-[#5865f2] hover:bg-[#4752c4]"
      >
        {downloadState === "idle" && "Download"}
        {downloadState === "downloading" && "Downloading..."}
        {downloadState === "decrypting" && "Decrypting..."}
        {downloadState === "complete" && "Done"}
        {downloadState === "error" && "Retry"}
      </Button>
    </div>
  );
}