import { UTApi } from "uploadthing/server";
import {
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";

import type { OurFileRouter } from "@/app/api/uploadthing/core";

export const UploadButton = generateUploadButton<OurFileRouter>();
export const UploadDropzone = generateUploadDropzone<OurFileRouter>();

export const uploadFiles = async (
  _endpoint: string,
  { files }: { files: Array<{ name: string; blob: Blob; size: number; type: string }> },
) => {
  const utapi = new UTApi();
  const uploaded = await utapi.uploadFiles(
    files.map(
      (file) =>
        new File([file.blob], file.name, {
          type: file.type,
          lastModified: Date.now(),
        }),
    ),
  );

  return Array.isArray(uploaded) ? uploaded : [uploaded];
};
