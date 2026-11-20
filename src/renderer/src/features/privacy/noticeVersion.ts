import type { TSettings } from "@/types/Settings";
import type { LauncherWhatsNewState } from "@renderer/utilities/whatsNew";

export const PRIVACY_NOTICE_VERSION = 2;

export type PrivacyNoticeKey = "crashTelemetry" | "usageStats" | "packAnalytics";

export const PRIVACY_NOTICE_ROWS: { key: PrivacyNoticeKey; id: string }[] = [
  { key: "crashTelemetry", id: "privacy-notice-crashes" },
  { key: "usageStats", id: "privacy-notice-usage" },
  { key: "packAnalytics", id: "privacy-notice-pack-analytics" },
];

type NoticeState = Pick<
  LauncherWhatsNewState,
  "privacyNoticeSeen" | "privacyNoticeVersion"
> | null;

export function seenPrivacyNoticeVersion(state: NoticeState): number {
  if (typeof state?.privacyNoticeVersion === "number") {
    return state.privacyNoticeVersion;
  }
  return state?.privacyNoticeSeen === true ? 1 : 0;
}

export function shouldShowPrivacyNotice(state: NoticeState): boolean {
  return seenPrivacyNoticeVersion(state) < PRIVACY_NOTICE_VERSION;
}

export function markPrivacyNoticeSeen(
  state: LauncherWhatsNewState | null,
): LauncherWhatsNewState {
  return {
    ...(state || {}),
    privacyNoticeSeen: true,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
  };
}

export function privacyNoticePatch(
  key: PrivacyNoticeKey,
  value: boolean,
): Partial<TSettings> {
  return { [key]: value };
}
