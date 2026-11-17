import {
  hasProviderLogo,
  ProviderIcon,
} from "@renderer/features/accounts/ProviderMark";

export function PlatformIcon({
  platform,
  size = 14,
}: {
  platform: string;
  size?: number;
}) {
  if (!hasProviderLogo(platform)) return null;

  return <ProviderIcon type={platform} size={size} />;
}
