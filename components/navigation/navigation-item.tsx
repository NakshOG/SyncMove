"use client";

import Image from "next/image";

import { useParams, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import { ActionTooltip } from "@/components/action-tooltip";

interface NavigationItemProps {
  id: string;
  imageUrl: string;
  name: string;
}

export const NavigationItem = ({
  id,
  imageUrl,
  name,
}: NavigationItemProps) => {
  const params = useParams();
  const router = useRouter();
  return (
    <ActionTooltip side="right" align="center" label={name}>
      <div
        onClick={() => router.push(`/servers/${id}`)}
        className="group relative flex items-center cursor-pointer"
      >
        <div
          className={cn(
            "absolute left-0 rounded-r-full bg-white transition-all w-[4px]",
            params?.serverID !== id && "group-hover:h-[20px]",
            params?.serverID === id ? "h-[36px]" : "h-[8px]"
          )}
        />

        <div
          className={cn(
            "relative mx-3 flex h-12 w-12 overflow-hidden rounded-2xl bg-[#313338] transition-all group-hover:rounded-xl"
          )}
        >
          <Image
            fill
            src={imageUrl}
            alt={name}
            className="object-cover"
          />
        </div>
      </div>
    </ActionTooltip>
  );
};
