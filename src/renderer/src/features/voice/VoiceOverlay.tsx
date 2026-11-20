import { useEffect, useState } from "react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
} from "motion/react";
import { useReducedMotionPreference } from "@/lib/motionPreference";
import { motionTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  HIDDEN_VOICE_OVERLAY,
  type OverlayToast,
  type VoiceOverlaySpeaker,
  type VoiceOverlayState,
} from "@/types/Voice";

function OverlayHead({ speaker }: { speaker: VoiceOverlaySpeaker }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [speaker.headUrl]);

  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-3xs font-semibold ring-2 ring-success",
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

function ToastHead({ toast }: { toast: OverlayToast }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [toast.headUrl]);

  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-3 text-xs font-semibold text-foreground">
      {toast.headUrl && !failed ? (
        <img
          src={toast.headUrl}
          alt=""
          width={32}
          height={32}
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-cover [image-rendering:pixelated]"
        />
      ) : (
        toast.initials
      )}
    </span>
  );
}

function ToastCard({ toast }: { toast: OverlayToast }) {
  return (
    <div
      className={cn(
        "flex w-72 items-start gap-2.5 rounded-xl border-l-2 bg-black/70 py-2 pr-3 pl-2 shadow-lg shadow-black/30",
        toast.kind === "call"
          ? "border-success"
          : toast.kind === "invite"
            ? "border-info"
            : "border-transparent",
      )}
    >
      <ToastHead toast={toast} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold text-white">
          {toast.title}
        </span>
        {toast.body && (
          <span className="line-clamp-2 text-xs leading-4 text-white/80">
            {toast.body}
          </span>
        )}
        {toast.action && (
          <span className="mt-1 w-fit rounded-md bg-white/15 px-1.5 py-0.5 text-xs font-medium text-white">
            {toast.action}
          </span>
        )}
      </div>
    </div>
  );
}

export function VoiceOverlay() {
  const [state, setState] = useState<VoiceOverlayState>(HIDDEN_VOICE_OVERLAY);
  const transition = motionTransition(useReducedMotionPreference());

  useEffect(() => window.api.voice.onOverlayState(setState), []);

  const corner = state.corner ?? "top-left";
  const fromRight = corner.endsWith("right");
  const offset = fromRight ? 8 : -8;

  return (
    <LazyMotion features={domAnimation}>
      <div
        className={cn(
          "flex h-screen flex-col gap-1.5 p-1",
          fromRight ? "items-end" : "items-start",
          corner.startsWith("bottom") ? "justify-end" : "justify-start",
        )}
      >
        <AnimatePresence initial={false}>
          {(state.toasts ?? []).map((toast) => (
            <m.div
              key={`toast:${toast.id}`}
              initial={{ opacity: 0, x: offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: offset }}
              transition={transition}
            >
              <ToastCard toast={toast} />
            </m.div>
          ))}
          {state.speakers.map((speaker) => (
            <m.div
              key={speaker.id}
              initial={{ opacity: 0, x: offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: offset }}
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
