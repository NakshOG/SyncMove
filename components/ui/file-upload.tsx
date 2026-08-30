import { UploadDropzone } from "@/lib/uploadthing";
import { X } from "lucide-react";
import { ima } from "next/image";

interface FileUploadProps {
  onchange: (url?: string) => void;
  value: string;
  endpoint: "MessageFile" | "ServerImage";
}

export const FileUpload = ({
  onchange,
  endpoint,
}: FileUploadProps) => {
  return (
    <UploadDropzone
      endpoint={endpoint}
      onClientUploadComplete={(res) => {
        onchange(res[0]?.url);
      }}
      onUploadError={(error) => {
        console.log(error);
      }}
      appearance={{
        container:
          "w-full h-[140px] border-2 border-dashed border-zinc-700 bg-zinc-800/50 rounded-lg flex flex-col items-center justify-center gap-2",

        uploadIcon:
          "w-8 h-8 text-zinc-400",

        label:
          "text-sm text-zinc-300",

        allowedContent:
          "text-xs text-zinc-500",

        button:
          "text-white text-xs px-3 py-2 rounded-md",
      }}
    />
  );
};