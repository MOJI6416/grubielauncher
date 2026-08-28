import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Loader2,
  PackageCheck,
  PackageMinus,
  PackageSearch,
  Radio,
  X,
} from "lucide-react";
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

const api = window.api;

const TEXTURE_OPTIONS: { value: number | null; icon: typeof PackageSearch }[] =
  [
    { value: null, icon: PackageSearch },
    { value: 1, icon: PackageCheck },
    { value: 0, icon: PackageMinus },
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
    } finally {
      await holdBusy(startedAt);
      probingRef.current = false;
      setIsProbing(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <Radio className="size-3.5 text-faint" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {editIndex === null ? t("servers.adding") : t("servers.editing")}
        </p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="size-4" />
        </Button>
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
            <span className="text-[0.7rem] text-destructive">
              {nameProblem}
            </span>
          ) : droppedNameCharacters.length > 0 ? (
            <span className="text-[0.7rem] text-warning">
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
            className="h-9 font-mono text-xs"
            placeholder="play.example.net:25565"
            onChange={(event) => {
              setAddress(event.currentTarget.value);
              setProbe(null);
            }}
          />
          {addressMessage ? (
            <span className="text-[0.7rem] text-destructive">
              {addressMessage}
            </span>
          ) : (
            <span className="text-[0.7rem] text-faint">
              {t("servers.addressHint")}
            </span>
          )}
        </label>

        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("servers.resources")}
          </span>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-1 p-1">
            {TEXTURE_OPTIONS.map((option, index) => {
              const Icon = option.icon;
              const active = acceptTextures === option.value;

              return (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setAcceptTextures(option.value)}
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs transition-colors",
                    active
                      ? "bg-surface-3 text-foreground"
                      : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">
                    {t(`servers.resourceSets.${index}`)}
                  </span>
                </button>
              );
            })}
          </div>
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
              <Radio className="size-3.5" />
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
                <span className="truncate text-muted-foreground">
                  {stripMotd(probe.versionName) || "—"}
                  {probe.players
                    ? ` · ${probe.players.online}/${probe.players.max}`
                    : ""}
                </span>
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
