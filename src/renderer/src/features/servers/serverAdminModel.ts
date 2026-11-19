import type { ServerAdminPlayer, ServerAdminSnapshot } from "@/types/ServerAdmin";

const PLAYER_NAME = /^[A-Za-z0-9_.]{1,16}$/;

export function isValidPlayerName(name: string): boolean {
  return PLAYER_NAME.test(name);
}

export function ruleLabel(key: string): string {
  return key.startsWith("minecraft:") ? key.slice("minecraft:".length) : key;
}

export function isOperator(
  snapshot: Pick<ServerAdminSnapshot, "operators">,
  player: ServerAdminPlayer,
): boolean {
  return snapshot.operators.some((operator) =>
    operator.id && player.id
      ? operator.id.toLowerCase() === player.id.toLowerCase()
      : operator.name.toLowerCase() === player.name.toLowerCase(),
  );
}

export function adminModeLabelKey(snapshot: ServerAdminSnapshot): string {
  if (snapshot.connecting) return "serverAdmin.mode.connecting";
  if (snapshot.mode === "msmp") {
    return snapshot.secure ? "serverAdmin.mode.msmpSecure" : "serverAdmin.mode.msmp";
  }
  return "serverAdmin.mode.console";
}

export function adminModeHintKey(snapshot: ServerAdminSnapshot): string {
  if (snapshot.connecting) return "serverAdmin.mode.connectingHint";
  if (snapshot.mode === "msmp") {
    return snapshot.secure
      ? "serverAdmin.mode.msmpSecureHint"
      : "serverAdmin.mode.msmpHint";
  }
  return snapshot.fallback === "old_version"
    ? "serverAdmin.mode.consoleOldHint"
    : "serverAdmin.mode.consoleFailedHint";
}
