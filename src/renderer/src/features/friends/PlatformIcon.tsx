import { FaDiscord, FaMicrosoft } from "react-icons/fa";
import { TbSquareLetterE } from "react-icons/tb";

export function PlatformIcon({
  platform,
  size = 14,
}: {
  platform: string;
  size?: number;
}) {
  switch (platform) {
    case "microsoft":
      return <FaMicrosoft size={size} />;
    case "elyby":
      return <TbSquareLetterE size={size} />;
    case "discord":
      return <FaDiscord size={size} />;
    default:
      return null;
  }
}
