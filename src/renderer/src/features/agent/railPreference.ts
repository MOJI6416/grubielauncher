import { useEffect, useState } from "react";

const RAIL_KEY = "grubie:agentRail";
const NARROW_RAIL_KEY = "grubie:agentRail:narrow";
const WIDE_QUERY = "(min-width: 1440px)";

function isWide(): boolean {
  try {
    return window.matchMedia(WIDE_QUERY).matches;
  } catch {
    return true;
  }
}

export function readRailPreference(wide = isWide()): boolean {
  try {
    const stored = localStorage.getItem(wide ? RAIL_KEY : NARROW_RAIL_KEY);
    return stored === null ? wide : stored !== "off";
  } catch {
    return wide;
  }
}

export function writeRailPreference(isOpen: boolean, wide = isWide()) {
  try {
    localStorage.setItem(wide ? RAIL_KEY : NARROW_RAIL_KEY, isOpen ? "on" : "off");
  } catch {}
}

export function useRailPreference(): [boolean, () => void] {
  const [isOpen, setOpen] = useState(() => readRailPreference());

  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia(WIDE_QUERY);
    } catch {
      return;
    }
    const onChange = () => setOpen(readRailPreference(query.matches));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = () =>
    setOpen((value) => {
      writeRailPreference(!value);
      return !value;
    });

  return [isOpen, toggle];
}
