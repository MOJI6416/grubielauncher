import { powerSaveBlocker } from "electron";
import { handleSafe } from "../utilities/ipc";
import { capturePttBind, setPttBind } from "../services/PushToTalk";

let powerSaveBlockerId: number | null = null;

export function registerVoiceIpc() {
  handleSafe(
    "voice:setPtt",
    undefined,
    async (_, bind: { type: "key" | "mouse"; code: number } | null) => {
      setPttBind(bind);
    },
  );

  handleSafe("voice:capturePttBind", null, async () => {
    return await capturePttBind();
  });

  handleSafe(
    "voice:setSessionActive",
    undefined,
    async (event, active: boolean) => {
      event.sender.setBackgroundThrottling(!active);

      if (active) {
        if (
          powerSaveBlockerId === null ||
          !powerSaveBlocker.isStarted(powerSaveBlockerId)
        ) {
          powerSaveBlockerId = powerSaveBlocker.start(
            "prevent-app-suspension",
          );
        }
      } else if (powerSaveBlockerId !== null) {
        if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
          powerSaveBlocker.stop(powerSaveBlockerId);
        }
        powerSaveBlockerId = null;
      }
    },
  );
}
