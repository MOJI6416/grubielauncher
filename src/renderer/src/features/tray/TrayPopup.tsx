import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpCircle,
  ExternalLink,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Play,
  Power,
  Users,
} from "lucide-react";
import type { Loader } from "@/types/Loader";
import type { TrayCommand, TrayModel } from "@/types/Tray";
import { cn } from "@/lib/utils";
import { changeAppLanguage } from "@renderer/i18n";
import { applyWindowAppearance } from "@renderer/features/theme/windowAppearance";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { BrandMark } from "@renderer/shell/BrandMark";
import { InstanceArt } from "@renderer/features/instances/InstanceArt";
import { getLoaderInfo, LoaderIcon } from "@renderer/components/Loaders";
import { Hint } from "@renderer/components/Hint";
import { formatClock } from "@renderer/utilities/duration";
import { updateBlock } from "@renderer/features/appUpdate/appUpdate";

const api = window.api;

function run(command: TrayCommand) {
  void api.trayPopup.run(command).catch(ignoreFailure);
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return now;
}

function RoundButton({
  label,
  tone = "neutral",
  active = false,
  onClick,
  children,
}: {
  label: string;
  tone?: "neutral" | "danger" | "success";
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors [&_svg]:size-4",
          tone === "danger" &&
            "bg-destructive/15 text-destructive hover:bg-destructive/25",
          tone === "success" &&
            "bg-success text-success-foreground hover:bg-success/90",
          tone === "neutral" &&
            (active
              ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
              : "bg-surface-3 text-foreground hover:bg-accent"),
        )}
      >
        {children}
      </button>
    </Hint>
  );
}

export function TrayPopup() {
  const { t } = useTranslation();
  const [model, setModel] = useState<TrayModel | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pendingReveal = useRef(true);
  const [shownCount, setShownCount] = useState(0);
  const now = useNow(Boolean(model?.voice));

  useEffect(
    () =>
      api.trayPopup.onShown(() => {
        pendingReveal.current = true;
        setShownCount((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    if (!model || !pendingReveal.current) return;

    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        pendingReveal.current = false;
        void api.trayPopup.reveal().catch(ignoreFailure);
      });
    });

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [model, shownCount]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    let cancelled = false;
    void api.trayPopup
      .getModel()
      .then((next) => {
        if (!cancelled && next) setModel(next);
      })
      .catch(ignoreFailure);
    const stop = api.trayPopup.onModel(setModel);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        void api.trayPopup.hide().catch(ignoreFailure);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelled = true;
      stop();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    void applyWindowAppearance();
  }, [model?.accent, model?.themeId, shownCount]);

  useEffect(() => {
    if (model?.lang) void changeAppLanguage(model.lang);
  }, [model?.lang]);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const report = () =>
      void api.trayPopup
        .resize(Math.ceil(element.getBoundingClientRect().height))
        .catch(ignoreFailure);
    report();

    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [model !== null]);

  if (!model) return null;

  const playing = model.playing[0];
  const updateBlocked = updateBlock({
    isGameRunning: model.playing.length > 0,
    isInstallActive: model.installing,
  });
  const updateNote = updateBlocked
    ? t(`appUpdate.blocked.${updateBlocked}`)
    : model.voice
      ? t("appUpdate.callWarning")
      : "";

  return (
    <div ref={rootRef} className="p-2 select-none">
      <div className="overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
        <header className="flex items-center gap-2.5 px-3 pt-3 pb-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-surface-3">
            <BrandMark className="size-4 text-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium whitespace-nowrap">
              Grubie Launcher
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  playing ? "bg-success" : "bg-faint",
                )}
              />
              <Hint
                content={
                  playing
                    ? t("trayPopup.playing", { name: playing })
                    : t("trayPopup.idle")
                }
                variant="text"
                truncatedOnly
              >
                <span className="truncate">
                  {playing
                    ? t("trayPopup.playing", { name: playing })
                    : t("trayPopup.idle")}
                </span>
              </Hint>
            </span>
          </span>
          <Hint content={t("tray.open")}>
            <button
              type="button"
              aria-label={t("tray.open")}
              onClick={() => run({ type: "open" })}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </button>
          </Hint>
        </header>

        {model.incomingCall && (
          <section className="mx-2 mb-2 flex items-center gap-2.5 rounded-lg bg-info/15 px-2.5 py-2">
            <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-info/20 text-info">
              <span className="absolute inset-0 animate-ping rounded-full bg-info/20" />
              <Phone className="relative size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-2xs text-muted-foreground">
                {t("tray.incoming")}
              </span>
              <Hint
                content={model.incomingCall.nickname}
                variant="text"
                truncatedOnly
              >
                <span className="block truncate text-sm font-medium">
                  {model.incomingCall.nickname}
                </span>
              </Hint>
            </span>
            <RoundButton
              label={t("tray.accept")}
              tone="success"
              onClick={() => run({ type: "acceptCall" })}
            >
              <Phone />
            </RoundButton>
            <RoundButton
              label={t("tray.decline")}
              tone="danger"
              onClick={() => run({ type: "declineCall" })}
            >
              <PhoneOff />
            </RoundButton>
          </section>
        )}

        {model.voice && (
          <section className="mx-2 mb-2 rounded-lg bg-surface-2 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-success" />
              <Hint content={model.voice.title} variant="text" truncatedOnly>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {model.voice.title}
                </span>
              </Hint>
              <span className="shrink-0 font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                {model.voice.since ? formatClock(now - model.voice.since) : ""}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5 shrink-0" />
                {model.voice.participants}
              </span>
              <RoundButton
                label={t(model.voice.muted ? "trayPopup.unmute" : "tray.mute")}
                active={model.voice.muted}
                onClick={() => run({ type: "toggleMute" })}
              >
                {model.voice.muted ? <MicOff /> : <Mic />}
              </RoundButton>
              <RoundButton
                label={t(
                  model.voice.deafened ? "trayPopup.undeafen" : "tray.deafen",
                )}
                active={model.voice.deafened}
                onClick={() => run({ type: "toggleDeafen" })}
              >
                {model.voice.deafened ? <HeadphoneOff /> : <Headphones />}
              </RoundButton>
              <RoundButton
                label={t("tray.leave")}
                tone="danger"
                onClick={() => run({ type: "leaveVoice" })}
              >
                <PhoneOff />
              </RoundButton>
            </div>
          </section>
        )}

        <section className="border-t border-border px-2 py-2">
          <p className="px-1.5 pb-1 text-2xs font-medium tracking-wide text-faint uppercase">
            {t("tray.play")}
          </p>
          {model.instances.length === 0 ? (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">
              {t("trayPopup.noInstances")}
            </p>
          ) : (
            model.instances.map((instance) => {
              const loader = getLoaderInfo(instance.loader);
              const meta = [
                instance.minecraft,
                instance.loader ? loader.name : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <button
                  key={instance.name}
                  type="button"
                  disabled={instance.running}
                  onClick={() =>
                    run({ type: "launch", versionName: instance.name })
                  }
                  className="group flex h-12 w-full items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-row-hover disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <InstanceArt
                    name={instance.name}
                    image={instance.image}
                    eager
                    className="size-9 rounded-md border border-border bg-surface-1"
                    textClassName="font-mono text-3xs"
                  />
                  <span className="min-w-0 flex-1">
                    <Hint content={instance.name} variant="text" truncatedOnly>
                      <span className="block truncate text-sm">
                        {instance.name}
                      </span>
                    </Hint>
                    <span className="flex min-w-0 items-center gap-1 text-xs text-faint">
                      {instance.loader && (
                        <LoaderIcon
                          loader={instance.loader as Loader}
                          className="size-3 shrink-0"
                        />
                      )}
                      <Hint content={meta} variant="text" truncatedOnly>
                        <span className="truncate">{meta}</span>
                      </Hint>
                    </span>
                  </span>
                  {instance.running ? (
                    <span className="shrink-0 rounded-md bg-success/15 px-1.5 py-0.5 text-2xs font-medium text-success">
                      {t("trayPopup.running")}
                    </span>
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-focus-visible:bg-primary group-focus-visible:text-primary-foreground">
                      <Play className="size-3.5 fill-current" />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </section>

        {model.updateVersion && (
          <section className="flex items-center gap-2.5 border-t border-border px-3 py-2.5">
            <ArrowUpCircle className="size-4 shrink-0 text-warning" />
            <span className="min-w-0 flex-1">
              <Hint
                content={t("trayPopup.updateReady", {
                  version: model.updateVersion,
                })}
                variant="text"
                truncatedOnly
              >
                <span className="block truncate text-xs">
                  {t("trayPopup.updateReady", { version: model.updateVersion })}
                </span>
              </Hint>
              {updateNote && (
                <span
                  className={cn(
                    "mt-0.5 block text-2xs leading-snug",
                    updateBlocked ? "text-muted-foreground" : "text-warning",
                  )}
                >
                  {updateNote}
                </span>
              )}
            </span>
            <button
              type="button"
              disabled={Boolean(updateBlocked)}
              onClick={() => run({ type: "installUpdate" })}
              className="h-7 shrink-0 rounded-lg bg-secondary px-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-3 disabled:opacity-50"
            >
              {t("appUpdate.install")}
            </button>
          </section>
        )}

        <footer className="border-t border-border p-1.5">
          <button
            type="button"
            onClick={() => run({ type: "quit" })}
            className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          >
            <Power className="size-4" />
            {t("tray.quit")}
          </button>
        </footer>
      </div>
    </div>
  );
}
