import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Check, Loader2, Server as ServerIcon, X } from "lucide-react";
import { IServer } from "@/types/ServersList";
import { toNbtSafeText } from "@/shared/nbtText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ServerPingResult } from "../../../../main/utilities/serverPing";
import {
  MAX_SERVER_NAME,
  findDuplicateAddress,
  findDuplicateName,
  normalizeAddress,
  validateAddress,
} from "./serverList";
import { PingBars } from "./ServerVisuals";
import { stripMotd } from "./motd";
import { holdBusy } from "@renderer/utilities/busy";
import { Hint } from "@renderer/components/Hint";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { showFailureToast } from "@renderer/utilities/failures";
import { useRedact } from "@renderer/features/streamer/streamerMode";

const api = window.api;

const TEXTURE_OPTIONS: { value: number | null }[] = [
  { value: null },
  { value: 1 },
  { value: 0 },
];

export function ServerEditor({
  servers,
  editIndex,
  onSubmit,
  onCancel,
}: {
  servers: IServer[];
  editIndex: number | null;
  onSubmit: (server: IServer) => void;
  onCancel: () => void;
}) {
  const source = editIndex === null ? undefined : servers[editIndex];
  const { t } = useTranslation();
  const redact = useRedact();

  const [name, setName] = useState(source?.name ?? "");
  const [address, setAddress] = useState(source?.ip ?? "");
  const [acceptTextures, setAcceptTextures] = useState<number | null>(
    source?.acceptTextures ?? null,
  );
  const [probe, setProbe] = useState<ServerPingResult | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const probingRef = useRef(false);

  const addressProblem = useMemo(() => validateAddress(address), [address]);

  const duplicateAddress = useMemo(
    () =>
      addressProblem === null &&
      findDuplicateAddress(servers, address, editIndex ?? undefined) >= 0,
    [servers, address, addressProblem, editIndex],
  );

  const duplicateName = useMemo(
    () =>
      findDuplicateName(servers, toNbtSafeText(name), editIndex ?? undefined) >=
      0,
    [servers, name, editIndex],
  );

  const trimmedName = toNbtSafeText(name).trim();
  const droppedNameCharacters = useMemo(() => {
    const found: string[] = [];
    for (const char of name) {
      if (toNbtSafeText(char) !== "" || found.includes(char)) continue;
      found.push(char);
    }
    return found;
  }, [name]);

  const nameProblem = !trimmedName
    ? t("servers.nameRequired")
    : trimmedName.length > MAX_SERVER_NAME
      ? t("servers.nameTooLong", { max: MAX_SERVER_NAME })
      : duplicateName
        ? t("servers.duplicateName")
        : undefined;

  const addressMessage = duplicateAddress
    ? t("servers.duplicateAddress")
    : addressProblem && addressProblem !== "empty"
      ? t(`servers.addressProblem.${addressProblem}`)
      : undefined;

  const canSubmit =
    !nameProblem && addressProblem === null && !duplicateAddress;

  const submit = () => {
    if (!canSubmit) return;

    onSubmit({
      ...(source ?? {}),
      name: trimmedName,
      ip: normalizeAddress(address),
      acceptTextures,
    });
  };

  const probeAddress = async () => {
    if (addressProblem !== null || probingRef.current) return;

    probingRef.current = true;
    const startedAt = Date.now();
    setIsProbing(true);
    setProbe(null);

    try {
      const result = await api.servers.ping(normalizeAddress(address));
      setProbe(result);
      if (result.online && !trimmedName && result.motd) {
        setName(
          toNbtSafeText(result.motd.split("\n")[0])
            .trim()
            .slice(0, MAX_SERVER_NAME),
        );
      }
    } catch (error) {
      showFailureToast(t("servers.testFailed"), error, {
        channels: ["servers:ping"],
      });
    } finally {
      await holdBusy(startedAt);
      probingRef.current = false;
      setIsProbing(false);
    }
  };

  const probeSummary = probe
    ? `${stripMotd(probe.versionName) || "—"}${
        probe.players ? ` · ${probe.players.online}/${probe.players.max}` : ""
      }`
    : "";

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <ServerIcon className="size-3.5 text-faint" />
        <Hint
          content={
            editIndex === null ? t("servers.adding") : t("servers.editing")
          }
          variant="text"
          truncatedOnly
        >
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {editIndex === null ? t("servers.adding") : t("servers.editing")}
          </p>
        </Hint>
        <Hint content={t("common.cancel")}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.cancel")}
            onClick={onCancel}
          >
            <X className="size-4" />
          </Button>
        </Hint>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("servers.name")}
          </span>
          <Input
            autoFocus
            value={name}
            maxLength={MAX_SERVER_NAME + 8}
            className="h-9"
            onChange={(event) => setName(event.currentTarget.value)}
          />
          {nameProblem && trimmedName ? (
            <span className="text-2xs text-destructive">{nameProblem}</span>
          ) : droppedNameCharacters.length > 0 ? (
            <span className="text-2xs text-warning">
              {t("servers.nameUnsupported", {
                characters: droppedNameCharacters.join(" "),
              })}
            </span>
          ) : null}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("servers.address")}
          </span>
          <Input
            value={address}
            className={cn(
              "h-9 font-mono text-xs",
              redact.active && "streamer-mask",
            )}
            placeholder="play.example.net:25565"
            onChange={(event) => {
              setAddress(event.currentTarget.value);
              setProbe(null);
            }}
          />
          {addressMessage ? (
            <span className="text-2xs text-destructive">{addressMessage}</span>
          ) : (
            <span className="text-2xs text-faint">
              {t("servers.addressHint")}
            </span>
          )}
        </label>

        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("servers.resources")}
          </span>
          <SegmentedControl
            value={String(acceptTextures)}
            stretch
            ariaLabel={t("servers.resources")}
            options={TEXTURE_OPTIONS.map((option, index) => ({
              value: String(option.value),
              label: t(`servers.resourceSets.${index}`),
            }))}
            onChange={(value) =>
              setAcceptTextures(
                TEXTURE_OPTIONS.find((option) => String(option.value) === value)
                  ?.value ?? null,
              )
            }
          />
        </div>

        <div className="grid gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={addressProblem !== null || isProbing}
            onClick={() => void probeAddress()}
          >
            {isProbing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Activity className="size-3.5" />
            )}
            {t("servers.test")}
          </Button>

          {probe ? (
            probe.online ? (
              <div className="grid gap-1 rounded-lg border border-success/40 bg-surface-1 px-2.5 py-2 text-xs">
                <span className="flex items-center gap-2 text-success">
                  <PingBars latencyMs={probe.latencyMs} />
                  {t("servers.statusOnline")}
                  {probe.latencyMs !== undefined && (
                    <span className="font-mono tabular-nums">
                      {probe.latencyMs} {t("servers.ms")}
                    </span>
                  )}
                </span>
                <Hint content={probeSummary} variant="text" truncatedOnly>
                  <span className="truncate text-muted-foreground">
                    {probeSummary}
                  </span>
                </Hint>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-surface-1 px-2.5 py-2 text-xs text-destructive">
                {t("servers.testFailed")}
              </div>
            )
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t bg-surface-1 px-3 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          className="flex-1"
          disabled={!canSubmit}
        >
          <Check className="size-3.5" />
          {editIndex === null ? t("common.add") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
