import { useEffect, useState } from "react";
import { loadSkinTexture, LoadedTexture } from "./skinPixels";
import { SkinTextureProblem } from "./skinTexture";

export type SkinTextureState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; texture: LoadedTexture }
  | { status: "error"; problem: SkinTextureProblem | "unreadable" };

export function useSkinTexture(url?: string | null): SkinTextureState {
  const [state, setState] = useState<SkinTextureState>({ status: "idle" });

  useEffect(() => {
    if (!url) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void loadSkinTexture(url).then((result) => {
      if (cancelled) return;

      setState(
        result.ok
          ? { status: "ready", texture: result.texture }
          : { status: "error", problem: result.problem },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
