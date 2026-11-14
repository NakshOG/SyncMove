"use client";

import Image from "next/image";

import { useParams, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import { ActionTooltip } from "@/components/action-tooltip";
import { Server } from "lucide-react";
import { useState } from "react";

interface NavigationItemProps {
  id: string;
  imageUrl: string;
  name: string;
}

export const NavigationItem = ({ id, imageUrl, name }: NavigationItemProps) => {
  const params = useParams();
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <ActionTooltip side="right" align="center" label={name}>
      <div
        onClick={() => router.push(`/servers/${id}`)}
        className="group relative flex items-center cursor-pointer"
      >
        <div
          className={cn(
            "absolute left-0 rounded-r-full bg-[#5865f2] transition-all w-[4px]",
            params?.serverID !== id && "group-hover:h-[20px]",
            params?.serverID === id ? "h-[36px]" : "h-[8px]",
          )}
        />

        <div
          className={cn(
            "relative mx-3 flex h-12 w-12 overflow-hidden rounded-xl bg-[#313338] transition-all group-hover:rounded-xl",
          )}
        >
          {imageUrl && !imageFailed ? (
            <Image
              fill
              src={imageUrl}
              alt={name}
              sizes="48px"
              className="object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#5865f2]" aria-label={`${name} server icon`}>
              <Server className="h-5 w-5 text-white" />
            </div>
          )}
        </div>
      </div>
    </ActionTooltip>
  );
};
