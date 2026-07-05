import { IServerConf, IServerSettings } from "@/types/Server";

import { ReactNode, useEffect, useState } from "react";
import { ILocalProject } from "@/types/ModManager";
import { useTranslation } from "react-i18next";
import {
  Gamepad2,
  Globe2,
  Link,
  Network,
  Package,
  Save,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const api = window.api;

const gameModes = ["survival", "creative", "adventure", "spectator"];
const difficulties = ["peaceful", "easy", "normal", "hard"];

function SettingsSection({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3 [.border-b]:pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <p className="truncate text-sm font-medium">{title}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className="grid gap-3 p-4">{children}</CardContent>
    </Card>
  );
}

export function ServerSettings({
  open,
  onClose,
  serverData,
  serverPath,
  resourcePacks,
}: {
  serverData: IServerConf;
  open: boolean;
  onClose: () => void;
  serverPath: string;
  resourcePacks: ILocalProject[];
}) {
  const [memory, setMemory] = useState(2048);
  const [settings, setSettings] = useState<IServerSettings | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [gameMode, setGameMode] = useState("survival");
  const [difficulty, setDifficulty] = useState("normal");
  const [whitelist, setWhitelist] = useState(false);
  const [onlineMode, setOnlineMode] = useState(false);
  const [pvp, setPvp] = useState(false);
  const [enableCommandBlock, setEnableCommandBlock] = useState(false);
  const [allowFlight, setAllowFlight] = useState(false);
  const [spawnAnimals, setSpawnAnimals] = useState(false);
  const [spawnMonsters, setSpawnMonsters] = useState(false);
  const [spawnNpcs, setSpawnNpcs] = useState(false);
  const [allowNether, setAllowNether] = useState(false);
  const [forceGamemode, setForceGamemode] = useState(false);
  const [spawnProtection, setSpawnProtection] = useState(0);
  const [requireResourcePack, setRequireResourcePack] = useState(false);
  const [resourcePack, setResourcePack] = useState("");
  const [resourcePackPrompt, setResourcePackPrompt] = useState("");
  const [motd, setMotd] = useState("");
  const [isWarnModal, setIsWarnModal] = useState(false);
  const [serverIp, setServerIp] = useState("");
  const [serverPort, setServerPort] = useState(25565);
  const [isResourcePack, setIsResourcePack] = useState(false);
  const [totalMem, setTotalMem] = useState(0);
  const [server, setServer] = useState<IServerConf | null>(null);
  const [aikarFlags, setAikarFlags] = useState(false);

  const { t } = useTranslation();

  function isSaveBtnisDisabled() {
    const nextResourcePack = requireResourcePack ? resourcePack : "";
    const nextResourcePackPrompt = requireResourcePack
      ? resourcePackPrompt
      : "";

    return (
      memory == server?.memory &&
      aikarFlags == (server?.aikarFlags ?? false) &&
      !(
        settings &&
        (maxPlayers != settings.maxPlayers ||
          gameMode != settings.gameMode ||
          difficulty != settings.difficulty ||
          whitelist != settings.whitelist ||
          onlineMode != settings.onlineMode ||
          pvp != settings.pvp ||
          enableCommandBlock != settings.enableCommandBlock ||
          allowFlight != settings.allowFlight ||
          spawnAnimals != settings.spawnAnimals ||
          spawnMonsters != settings.spawnMonsters ||
          spawnNpcs != settings.spawnNpcs ||
          allowNether != settings.allowNether ||
          forceGamemode != settings.forceGamemode ||
          spawnProtection != settings.spawnProtection ||
          requireResourcePack != settings.requireResourcePack ||
          nextResourcePack != settings.resourcePack ||
          nextResourcePackPrompt != settings.resourcePackPrompt ||
          motd != settings.motd ||
          serverIp != settings.serverIp ||
          serverPort != settings.serverPort)
      )
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (cancelled) return;

      setServer(serverData);
      setMemory(serverData.memory);
      setAikarFlags(serverData.aikarFlags ?? false);

      const settings = await api.server.getSettings(
        await api.path.join(serverPath, "server.properties"),
      );

      setSettings(settings);
      setServer(serverData);
      setMaxPlayers(settings.maxPlayers);
      setGameMode(settings.gameMode);
      setDifficulty(settings.difficulty);
      setWhitelist(settings.whitelist);
      setOnlineMode(settings.onlineMode);
      setPvp(settings.pvp);
      setEnableCommandBlock(settings.enableCommandBlock);
      setAllowFlight(settings.allowFlight);
      setSpawnAnimals(settings.spawnAnimals);
      setSpawnMonsters(settings.spawnMonsters);
      setSpawnNpcs(settings.spawnNpcs);
      setAllowNether(settings.allowNether);
      setForceGamemode(settings.forceGamemode);
      setSpawnProtection(settings.spawnProtection);
      setRequireResourcePack(settings.requireResourcePack);
      setResourcePack(settings.resourcePack);
      setResourcePackPrompt(settings.resourcePackPrompt);
      setMotd(settings.motd);
      setServerIp(settings.serverIp);
      setServerPort(settings.serverPort);
      const totalMem = await api.os.totalmem();
      setTotalMem(totalMem / (1024 * 1024));

      if (resourcePacks.length > 0) {
        const pack = resourcePacks.find(
          (pack) => pack.version?.files[0].url == settings.resourcePack,
        );
        if (pack) setIsResourcePack(true);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const maxMemory = Math.max(1024, totalMem - 512);

  const handleClose = () => {
    if (!isSaveBtnisDisabled()) {
      setIsWarnModal(true);
      return;
    }

    onClose();
  };

  const setNumberValue = (
    value: string,
    setter: (value: number) => void,
    min = 0,
    max?: number,
  ) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;

    const next = Math.max(
      min,
      max === undefined ? parsed : Math.min(max, parsed),
    );
    setter(next);
  };

  const handleSave = async () => {
    const nextResourcePack = requireResourcePack ? resourcePack : "";
    const nextResourcePackPrompt = requireResourcePack
      ? resourcePackPrompt
      : "";

    if (server?.memory != memory) {
      setMemory(memory);
      await api.server.editXmx(serverPath, memory);
    }

    if ((server?.aikarFlags ?? false) != aikarFlags) {
      await api.server.setAikar(serverPath, aikarFlags);
    }

    if (settings) {
      if (maxPlayers != settings.maxPlayers) settings.maxPlayers = maxPlayers;
      if (gameMode != settings.gameMode) settings.gameMode = gameMode;
      if (difficulty != settings.difficulty) settings.difficulty = difficulty;
      if (whitelist != settings.whitelist) settings.whitelist = whitelist;
      if (onlineMode != settings.onlineMode) settings.onlineMode = onlineMode;
      if (pvp != settings.pvp) settings.pvp = pvp;
      if (enableCommandBlock != settings.enableCommandBlock)
        settings.enableCommandBlock = enableCommandBlock;
      if (allowFlight != settings.allowFlight)
        settings.allowFlight = allowFlight;
      if (spawnAnimals != settings.spawnAnimals)
        settings.spawnAnimals = spawnAnimals;
      if (spawnMonsters != settings.spawnMonsters)
        settings.spawnMonsters = spawnMonsters;
      if (spawnNpcs != settings.spawnNpcs) settings.spawnNpcs = spawnNpcs;
      if (allowNether != settings.allowNether)
        settings.allowNether = allowNether;
      if (forceGamemode != settings.forceGamemode)
        settings.forceGamemode = forceGamemode;
      if (spawnProtection != settings.spawnProtection)
        settings.spawnProtection = spawnProtection;
      if (requireResourcePack != settings.requireResourcePack)
        settings.requireResourcePack = requireResourcePack;
      if (nextResourcePack != settings.resourcePack)
        settings.resourcePack = nextResourcePack;
      if (nextResourcePackPrompt != settings.resourcePackPrompt)
        settings.resourcePackPrompt = nextResourcePackPrompt;
      if (motd != settings.motd) settings.motd = motd;
      if (serverIp != settings.serverIp) settings.serverIp = serverIp;
      if (serverPort != settings.serverPort) settings.serverPort = serverPort;

      await api.server.updateProperties(
        await api.path.join(serverPath, "server.properties"),
        settings,
      );

      setResourcePack(nextResourcePack);
      setResourcePackPrompt(nextResourcePackPrompt);
      setSettings({ ...settings });
    }

    await api.fs.writeJSON(await api.path.join(serverPath, "conf.json"), {
      ...server!,
      memory,
      aikarFlags,
    });

    setServer({
      ...server!,
      memory,
      aikarFlags,
    });

    toast.success(t("settings.saved"));
  };

  const checkboxField = (
    label: string,
    checked: boolean,
    onCheckedChange: (checked: boolean) => void,
  ) => (
    <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent/55">
      <span className="min-w-0 truncate">{label}</span>
      <Switch
        className="shrink-0"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </label>
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          handleClose();
        }}
      >
        <DialogContent aria-describedby={undefined}
          className="min-w-0 overflow-hidden p-0 sm:max-w-2xl"
          onInteractOutside={(event) => {
            const target = event.target;
            if (
              target instanceof HTMLElement &&
              target.closest("[data-slot='select-content']")
            ) {
              event.preventDefault();
            }
          }}
        >
            <DialogHeader className="px-5 pt-5">
              <DialogTitle className="flex items-center gap-2">
                <SlidersHorizontal className="size-5" />
                {t("settings.title")}
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="max-h-[min(70vh,620px)]">
              <div className="grid min-w-0 gap-4 px-5 pb-5 pr-6">
                <SettingsSection
                  title={t("settings.memory")}
                  icon={<SlidersHorizontal className="size-4" />}
                  action={
                    <span className="text-sm font-medium tabular-nums">
                      {memory} {t("settings.mb")}
                    </span>
                  }
                >
                  <Slider
                    step={512}
                    value={[memory]}
                    min={1024}
                    max={maxMemory}
                    onValueChange={(value) => {
                      const next = value[0];
                      if (typeof next === "number") {
                        setMemory(Number(next.toFixed(0)));
                      }
                    }}
                  />

                  <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent/55">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate">
                        {t("versions.aikarFlags")}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t("versions.aikarFlagsHint")}
                      </span>
                    </div>
                    <Switch
                      className="shrink-0"
                      checked={aikarFlags}
                      onCheckedChange={(value) => setAikarFlags(value === true)}
                    />
                  </label>
                </SettingsSection>

                <SettingsSection
                  title={t("serverSettings.sections.connection")}
                  icon={<Network className="size-4" />}
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">IP</span>
                      <Input
                        value={serverIp}
                        onChange={(event) =>
                          setServerIp(event.currentTarget.value)
                        }
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">
                        {t("serverSettings.port")}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={65535}
                        value={serverPort}
                        onChange={(event) =>
                          setNumberValue(
                            event.currentTarget.value,
                            setServerPort,
                            0,
                            65535,
                          )
                        }
                      />
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">
                      {t("serverSettings.description")}
                    </span>
                    <Input
                      value={motd}
                      onChange={(event) => setMotd(event.currentTarget.value)}
                    />
                  </label>
                </SettingsSection>

                <SettingsSection
                  title={t("serverSettings.sections.game")}
                  icon={<Gamepad2 className="size-4" />}
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">
                        {t("serverSettings.gameMode")}
                      </span>
                      <Select value={gameMode} onValueChange={setGameMode}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {gameModes.map((mode, index) => (
                            <SelectItem key={mode} value={mode}>
                              {t(`serverSettings.gameModes.${index}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">
                        {t("serverSettings.difficulty")}
                      </span>
                      <Select value={difficulty} onValueChange={setDifficulty}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {difficulties.map((diff, index) => (
                            <SelectItem key={diff} value={diff}>
                              {t(`serverSettings.difficulties.${index}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">
                        {t("serverSettings.maxPlayers")}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        value={maxPlayers}
                        onChange={(event) =>
                          setNumberValue(
                            event.currentTarget.value,
                            setMaxPlayers,
                          )
                        }
                      />
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">
                      {t("serverSettings.spawnProtection")}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={spawnProtection}
                      onChange={(event) =>
                        setNumberValue(
                          event.currentTarget.value,
                          setSpawnProtection,
                        )
                      }
                    />
                  </label>
                </SettingsSection>

                <SettingsSection
                  title={t("serverSettings.sections.rules")}
                  icon={<Shield className="size-4" />}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    {checkboxField(
                      t("serverSettings.whitelist"),
                      whitelist,
                      setWhitelist,
                    )}
                    {checkboxField(
                      t("serverSettings.onlineMode"),
                      onlineMode,
                      setOnlineMode,
                    )}
                    {checkboxField("PVP", pvp, setPvp)}
                    {checkboxField(
                      t("serverSettings.enableCommandBlock"),
                      enableCommandBlock,
                      setEnableCommandBlock,
                    )}
                    {checkboxField(
                      t("serverSettings.allowFlight"),
                      allowFlight,
                      setAllowFlight,
                    )}
                    {checkboxField(
                      t("serverSettings.forceGamemode"),
                      forceGamemode,
                      setForceGamemode,
                    )}
                    {checkboxField(
                      t("serverSettings.spawnAnimals"),
                      spawnAnimals,
                      setSpawnAnimals,
                    )}
                    {checkboxField(
                      t("serverSettings.spawnMonsters"),
                      spawnMonsters,
                      setSpawnMonsters,
                    )}
                    {checkboxField(
                      t("serverSettings.spawnNPCs"),
                      spawnNpcs,
                      setSpawnNpcs,
                    )}
                    {checkboxField(
                      t("serverSettings.allowNether"),
                      allowNether,
                      setAllowNether,
                    )}
                  </div>
                </SettingsSection>

                <SettingsSection
                  title={t("serverSettings.resourcePack")}
                  icon={<Globe2 className="size-4" />}
                  action={
                    <Switch
                      checked={requireResourcePack}
                      onCheckedChange={(value) =>
                        setRequireResourcePack(value === true)
                      }
                      aria-label={t("serverSettings.requireResourcePack")}
                    />
                  }
                >
                  <div className="flex items-end gap-2">
                    {isResourcePack ? (
                      <div className="grid min-w-0 flex-1 gap-2">
                        <span className="text-sm font-medium">
                          {t("serverSettings.resourcePack")}
                        </span>
                        <Select
                          value={resourcePack || undefined}
                          onValueChange={setResourcePack}
                          disabled={!requireResourcePack}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t("common.select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {resourcePacks.map((pack, index) => {
                              const url = pack.version?.files[0].url;
                              return (
                                <SelectItem
                                  key={url || index}
                                  value={url || String(index)}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    {pack.iconUrl && (
                                      <img
                                        className="size-6 shrink-0 rounded object-cover"
                                        src={pack.iconUrl}
                                        height={24}
                                        width={24}
                                        alt=""
                                      />
                                    )}
                                    <span className="truncate">
                                      {pack.title}
                                    </span>
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <label className="grid min-w-0 flex-1 gap-2">
                        <span className="text-sm font-medium">
                          {t("serverSettings.resourcePack")}
                        </span>
                        <Input
                          value={resourcePack}
                          disabled={!requireResourcePack}
                          onChange={(event) => {
                            setResourcePack(event.currentTarget.value);
                          }}
                        />
                      </label>
                    )}
                    <Button
                      variant="secondary"
                      size="icon-lg"
                      disabled={
                        !requireResourcePack || resourcePacks.length == 0
                      }
                      onClick={() => {
                        const checked = !isResourcePack;

                        if (checked && resourcePacks.length > 0) {
                          const pack = resourcePacks.find(
                            (pack) =>
                              pack.version?.files[0].url == resourcePack,
                          );
                          if (pack && pack.version)
                            setResourcePack(pack.version.files[0].url);
                        }

                        setIsResourcePack(checked);
                      }}
                    >
                      {isResourcePack ? (
                        <Package className="size-4" />
                      ) : (
                        <Link className="size-4" />
                      )}
                    </Button>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">
                      {t("serverSettings.requestResourcePack")}
                    </span>
                    <Input
                      value={resourcePackPrompt}
                      disabled={!requireResourcePack}
                      onChange={(event) =>
                        setResourcePackPrompt(event.currentTarget.value)
                      }
                    />
                  </label>
                </SettingsSection>
              </div>
            </ScrollArea>

            <DialogFooter className="m-0 rounded-none border-t bg-muted/25 px-5 py-4">
              <Button disabled={isSaveBtnisDisabled()} onClick={handleSave}>
                <Save className="size-4" />
                {t("common.save")}
              </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isWarnModal}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setIsWarnModal(false);
        }}
      >
        <DialogContent aria-describedby={undefined} className="overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="border-b py-4 pr-12 pl-5">
            <DialogTitle>{t("common.confirmation")}</DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4">
            <p className="text-sm text-muted-foreground">
              {t("serverSettings.unsavedChanges")}
            </p>
          </div>

          <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-2 rounded-none rounded-b-xl border-t bg-muted/25 px-5 py-4 sm:gap-2">
            <Button variant="outline" onClick={() => setIsWarnModal(false)}>
              {t("common.no")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setIsWarnModal(false);
                onClose();
              }}
            >
              {t("common.yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
