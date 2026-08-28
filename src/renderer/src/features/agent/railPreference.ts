const RAIL_KEY = "grubie:agentRail";

export function readRailPreference(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeRailPreference(isOpen: boolean) {
  try {
    localStorage.setItem(RAIL_KEY, isOpen ? "on" : "off");
  } catch {}
}
