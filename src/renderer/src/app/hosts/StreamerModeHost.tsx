import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { settingsAtom } from "@renderer/stores/atoms";
import {
  subscribeStreamingApp,
  updateStreamingWatch,
} from "@renderer/features/streamer/streamerMode";

export function StreamerModeHost() {
  const auto = useAtomValue(settingsAtom).streamerModeAuto;

  useEffect(() => subscribeStreamingApp(), []);

  useEffect(() => {
    updateStreamingWatch(auto);
  }, [auto]);

  return null;
}
