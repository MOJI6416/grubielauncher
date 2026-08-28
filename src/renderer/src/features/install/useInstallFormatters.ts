import { useTranslation } from "react-i18next";
import { formatBytes } from "@renderer/utilities/file";
import {
  formatByteRange,
  formatElapsed,
  formatSeconds,
} from "./progressModel";

export function useInstallFormatters() {
  const { t } = useTranslation();

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  const times = [
    t("timeUnits.0"),
    t("timeUnits.1"),
    t("timeUnits.2"),
    t("timeUnits.3"),
  ];

  return {
    bytes: (value: number) => formatBytes(value, sizes, 1),
    byteRange: (done: number, total: number) =>
      formatByteRange(done, total, sizes),
    speed: (value: number) => `${formatBytes(value, sizes, 1)}/${times[0]}`,
    seconds: (value: number) => formatSeconds(value, times),
    elapsed: (value: number) => formatElapsed(value, times),
  };
}
