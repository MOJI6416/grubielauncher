import { IServer } from "@/types/ServersList";
import { Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ServersPanel } from "./ServersPanel";

export function ServersDialog({
  servers,
  setServers,
  onClose,
  quickConnectIp,
  setQuickConnectIp,
  isAdding,
}: {
  servers: IServer[];
  setServers: React.Dispatch<React.SetStateAction<IServer[]>>;
  quickConnectIp: string | undefined;
  setQuickConnectIp: (ip: string) => void;
  onClose: () => void;
  isAdding?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[32rem] max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
            <Server className="size-4 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate">{t("servers.title")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <ServersPanel
            servers={servers}
            setServers={setServers}
            quickConnectIp={quickConnectIp}
            setQuickConnectIp={setQuickConnectIp}
            isAdding={isAdding}
            onPlayed={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
