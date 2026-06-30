import { IServer } from "@/types/ServersList";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectedVersionAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function CreateServer({
  onClose,
  servers,
  setServers,
  setQuickConnectIp,
}: {
  onClose: () => void;
  servers: IServer[];
  setServers: React.Dispatch<React.SetStateAction<IServer[]>>;
  setQuickConnectIp: (ip: string) => void;
}) {
  const [serverName, setServerName] = useState("");
  const [serverAddress, setServerAddress] = useState("");
  const [acceptTextures, setAcceptTextures] = useState<number | null>(null);
  const [isQuickConnect, setIsQuickConnect] = useState(false);
  const [selectedVersion] = useAtom(selectedVersionAtom);

  const { t } = useTranslation();

  const normalizedName = useMemo(() => serverName.trim(), [serverName]);
  const normalizedAddress = useMemo(
    () => serverAddress.trim(),
    [serverAddress],
  );

  const normalizedAddressKey = useMemo(() => {
    return normalizedAddress.toLowerCase();
  }, [normalizedAddress]);

  const isAddressValid = useMemo(() => {
    if (!normalizedAddress) return false;
    if (normalizedAddress.includes(" ")) return false;
    return true;
  }, [normalizedAddress]);

  const isDuplicate = useMemo(() => {
    const nameKey = normalizedName.toLowerCase();
    return servers.some(
      (s) =>
        s.name.trim().toLowerCase() === nameKey ||
        s.ip.trim().toLowerCase() === normalizedAddressKey,
    );
  }, [servers, normalizedName, normalizedAddressKey]);

  const canCreate =
    normalizedName !== "" &&
    normalizedAddress !== "" &&
    isAddressValid &&
    !isDuplicate;

  const createServer = () => {
    if (!canCreate) return;

    const newServer: IServer = {
      name: normalizedName,
      ip: normalizedAddress,
      acceptTextures,
    };

    setServers((prev) => [...prev, newServer]);

    if (isQuickConnect) {
      setQuickConnectIp(newServer.ip);
    }

    toast.success(t("servers.added"));
    onClose();
  };

  return (
    <>
      <DialogHeader className="border-b py-4 pr-12 pl-5">
        <DialogTitle className="flex items-center gap-2">
          <Plus className="size-5" />
          {t("servers.adding")}
        </DialogTitle>
      </DialogHeader>

      <form
        className="grid gap-4 px-5 py-"
        onSubmit={(event) => {
          event.preventDefault();
          createServer();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="server-name">{t("servers.name")}</Label>
          <Input
            id="server-name"
            value={serverName}
            onChange={(e) => setServerName(e.currentTarget.value)}
            autoFocus
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="server-address">{t("servers.address")}</Label>
          <Input
            id="server-address"
            value={serverAddress}
            onChange={(e) => setServerAddress(e.currentTarget.value)}
            className="font-mono text-sm"
          />
        </div>

        <div className="grid gap-2">
          <Label>{t("servers.resources")}</Label>
          <Select
            value={acceptTextures === null ? "null" : String(acceptTextures)}
            onValueChange={(value) => {
              if (!value) return;
              setAcceptTextures(value === "null" ? null : Number(value));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("servers.resources")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">
                {t("servers.resourceSets.0")}
              </SelectItem>
              <SelectItem value="1">{t("servers.resourceSets.1")}</SelectItem>
              <SelectItem value="0">{t("servers.resourceSets.2")}</SelectItem>
            </SelectContent>
          </Select>

          {selectedVersion?.isQuickPlayMultiplayer && (
            <label className="mt-1 flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
              <Checkbox
                checked={isQuickConnect}
                onCheckedChange={(checked) =>
                  setIsQuickConnect(checked === true)
                }
              />
              {t("servers.quickConnect")}
            </label>
          )}
        </div>
      </form>

      <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-2 rounded-none rounded-b-xl border-t bg-muted/20 px-5 py-4 sm:gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          disabled={!canCreate}
          onClick={() => {
            if (isDuplicate) toast.warning(t("servers.already"));
            createServer();
          }}
        >
          <Plus />
          {t("servers.add")}
        </Button>
      </DialogFooter>
    </>
  );
}
