import { ScreenshotFeed } from "@renderer/features/screenshots/ScreenshotFeed";

export function ScreenshotsScreen({ instance }: { instance?: string }) {
  return <ScreenshotFeed instance={instance} />;
}
