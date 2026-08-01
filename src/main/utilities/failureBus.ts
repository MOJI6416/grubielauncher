import { BrowserWindow } from "electron";
import { classifyError, FailureContext, FailureInfo } from "@/shared/errors";

export function reportFailure(
  error: unknown,
  context: FailureContext,
): FailureInfo {
  const failure = classifyError(error, context);

  const payload = {
    channel: failure.channel ?? "",
    notify: false,
    failure,
    message: failure.message,
  };

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send("ipc:error", payload);
  }

  return failure;
}
