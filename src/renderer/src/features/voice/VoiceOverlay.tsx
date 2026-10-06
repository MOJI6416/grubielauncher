import { useEffect, useState } from "react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { motionTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  HIDDEN_VOICE_OVERLAY,
  type VoiceOverlaySpeaker,
  type VoiceOverlayState,
} from "@/types/Voice";

function OverlayHead({ speaker }: { speaker: VoiceOverlaySpeaker }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [speaker.headUrl]);

  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold ring-2 ring-success",
        speaker.isLocal
          ? "bg-primary/80 text-white"
          : "bg-surface-3 text-foreground",
      )}
    >
      {speaker.headUrl && !failed ? (
        <img
          src={speaker.headUrl}
          alt=""
          width={24}
          height={24}
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-cover [image-rendering:pixelated]"
        />
      ) : (
        speaker.initials
      )}
    </span>
  );
}

export function VoiceOverlay() {
  const [state, setState] = useState<VoiceOverlayState>(HIDDEN_VOICE_OVERLAY);
  const transition = motionTransition(useReducedMotion());

  useEffect(() => window.api.voice.onOverlayState(setState), []);

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex flex-col items-start gap-1.5 p-1">
        <AnimatePresence initial={false}>
          {state.speakers.map((speaker) => (
            <m.div
              key={speaker.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={transition}
              className="flex max-w-60 items-center gap-2 rounded-full bg-black/60 py-1 pr-3 pl-1 shadow-lg shadow-black/30"
            >
              <OverlayHead speaker={speaker} />
              <span className="min-w-0 truncate text-[13px] font-medium text-white">
                {speaker.name}
              </span>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}
