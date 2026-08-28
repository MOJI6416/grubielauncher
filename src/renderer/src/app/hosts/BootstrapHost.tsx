import { useEffect } from "react";
import { preload, schedulePreload } from "@renderer/utilities/lazyPreload";
import {
  LazyNewInstanceScreen,
  LazyNewsScreen,
  LazyPeopleScreen,
} from "@renderer/screens/lazyScreens";
import { runBootstrap } from "../bootstrap/runBootstrap";

const api = window.api;

export function BootstrapHost() {
  useEffect(() => {
    let cancelled = false;

    void runBootstrap(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const addVersionPreload = window.setTimeout(() => {
      preload(LazyNewInstanceScreen.preload);
    }, 0);

    const cancelScheduledPreload = schedulePreload(
      [
        LazyNewsScreen.preload,
        LazyPeopleScreen.preload,
        () => api.versions.getList("vanilla", false),
      ],
      900,
    );

    return () => {
      window.clearTimeout(addVersionPreload);
      cancelScheduledPreload();
    };
  }, []);

  return null;
}
