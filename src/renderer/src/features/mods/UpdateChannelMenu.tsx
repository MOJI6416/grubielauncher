import { useTranslation } from "react-i18next";
import { RotateCw } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  UPDATE_CHANNELS,
  isUpdateChannel,
  type UpdateChannel,
} from "@/shared/updateChannel";

const DEFAULT_VALUE = "default";

export function UpdateChannelItems({
  instanceChannel,
  inheritedChannel,
  onCheck,
  onChange,
}: {
  instanceChannel: UpdateChannel | null;
  inheritedChannel: UpdateChannel;
  onCheck?: () => void;
  onChange: (channel: UpdateChannel | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {onCheck && (
        <>
          <DropdownMenuItem onSelect={onCheck}>
            <RotateCw />
            {t("modManager.checkUpdates")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {t("modManager.updateChannel.title")}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={instanceChannel ?? DEFAULT_VALUE}
        onValueChange={(value) =>
          onChange(isUpdateChannel(value) ? value : null)
        }
      >
        <DropdownMenuRadioItem value={DEFAULT_VALUE}>
          {t("modManager.updateChannel.inherit", {
            channel: t(`modManager.updateChannel.short.${inheritedChannel}`),
          })}
        </DropdownMenuRadioItem>
        {UPDATE_CHANNELS.map((channel) => (
          <DropdownMenuRadioItem key={channel} value={channel}>
            {t(`modManager.updateChannel.options.${channel}`)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
