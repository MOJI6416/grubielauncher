import { Loader } from "@/types/Loader";
import { Select, SelectItem } from "@heroui/react";
import fabricIcon from "@renderer/assets/loaders/fabric.svg";
import forgeIcon from "@renderer/assets/loaders/forge.svg";
import neoforgeIcon from "@renderer/assets/loaders/neoforge.svg";
import quiltIcon from "@renderer/assets/loaders/quilt.svg";

type LoaderInfo = {
  name: string;
  style: string;
  icon?: string;
  iconScaleClassName?: string;
};

export const loaders = {
  vanilla: {
    name: "Vanilla",
    style:
      "bg-gradient-to-b from-[#86F87B] via-[#54C462] to-[#1B6A34] text-transparent bg-clip-text",
  },

  forge: {
    name: "Forge",
    style:
      "bg-gradient-to-b from-[#F3C691] via-[#DFA86A] to-[#A56733] text-transparent bg-clip-text",
    icon: forgeIcon,
    iconScaleClassName: "scale-110",
  },

  neoforge: {
    name: "NeoForge",
    style:
      "bg-gradient-to-b from-[#F0A34B] via-[#D7742F] to-[#A44E37] text-transparent bg-clip-text",
    icon: neoforgeIcon,
    iconScaleClassName: "scale-100",
  },

  fabric: {
    name: "Fabric",
    style:
      "bg-gradient-to-b from-[#F0E5CD] via-[#DBD0B4] to-[#38342A] text-transparent bg-clip-text",
    icon: fabricIcon,
    iconScaleClassName: "scale-95",
  },

  quilt: {
    name: "Quilt",
    style:
      "bg-gradient-to-b from-[#9722FF] via-[#DC29DD] to-[#27A2FD] text-transparent bg-clip-text",
    icon: quiltIcon,
    iconScaleClassName: "scale-90",
  },
} satisfies Record<Loader, LoaderInfo>;

const loaderTabs: Loader[] = [
  "vanilla",
  "forge",
  "neoforge",
  "fabric",
  "quilt",
];

export function getLoaderInfo(loader?: string): LoaderInfo {
  if (loader && loader in loaders) {
    return loaders[loader as Loader];
  }

  return loaders.vanilla;
}

export function LoaderLabel({
  loader,
  className = "",
  iconClassName = "",
  textClassName = "",
}: {
  loader?: string;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  const info = getLoaderInfo(loader);

  return (
    <div className={`flex min-w-0 items-center gap-1 ${className}`.trim()}>
      {info.icon && (
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
          <img
            src={info.icon}
            alt=""
            aria-hidden="true"
            className={`h-full w-full object-contain ${info.iconScaleClassName || ""} ${iconClassName}`.trim()}
          />
        </span>
      )}
      <span className={`truncate ${info.style} ${textClassName}`.trim()}>
        {info.name}
      </span>
    </div>
  );
}

export function Loaders({
  select,
  isLoading,
  isDisabled = false,
  loader,
  label = "Loader",
}: {
  select: (loader: Loader) => void;
  isLoading: boolean;
  isDisabled?: boolean;
  loader: string;
  label?: string;
}) {
  const selectedLoader =
    loader && loader in loaders ? (loader as Loader) : "vanilla";

  return (
    <Select
      aria-label={label}
      className="w-full"
      disallowEmptySelection
      isDisabled={isLoading || isDisabled}
      label={label}
      onChange={(event) => {
        const value = event.target.value as Loader;
        if (value) select(value);
      }}
      renderValue={(items) =>
        items.map((item) => (
          <LoaderLabel
            key={String(item.key)}
            loader={String(item.key)}
            className="max-w-full"
          />
        ))
      }
      selectedKeys={[selectedLoader]}
    >
      {loaderTabs.map((loaderKey) => (
        <SelectItem key={loaderKey} textValue={loaders[loaderKey].name}>
          <LoaderLabel loader={loaderKey} />
        </SelectItem>
      ))}
    </Select>
  );
}
