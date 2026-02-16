import {
  addToast,
  Alert,
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import {
  accountAtom,
  authDataAtom,
  consolesAtom,
  networkAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { ArrowLeft, Trash } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const api = window.api;

export function DeleteVersion({
  close,
}: {
  close: (isDeleted?: boolean) => void;
}) {
  const [version] = useAtom(selectedVersionAtom);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const [fullDel, setFullDel] = useState(false);
  const [shareDel, setShareDel] = useState(true);

  const [account] = useAtom(accountAtom);
  const [, setVersions] = useAtom(versionsAtom);
  const [isNetwork] = useAtom(networkAtom);
  const [authData] = useAtom(authDataAtom);
  const [, setConsoles] = useAtom(consolesAtom);

  const canOfferRemoteDelete = useMemo(() => {
    return !!version?.version.shareCode && !version.version.downloadedVersion;
  }, [version]);

  const canDeleteRemote = useMemo(() => {
    return (
      !!version?.version.shareCode &&
      !version.version.downloadedVersion &&
      shareDel &&
      isNetwork &&
      !!authData &&
      !!account?.accessToken
    );
  }, [version, shareDel, isNetwork, authData, account?.accessToken]);

  const versionKey = useMemo(() => {
    if (!version) return null;
    return {
      name: version.version.name,
      path: version.versionPath,
    };
  }, [version]);

  return (
    <Modal
      isOpen={true}
      onClose={() => {
        if (isLoading) return;
        close();
      }}
      isDismissable={!isLoading}
    >
      <ModalContent>
        <ModalHeader>{t("common.confirmation")}</ModalHeader>

        <ModalBody>
          <div className="flex flex-col space-y-2 max-w-96">
            <div className="flex flex-col gap-1.5">
              <Alert color="warning" title={t("versions.savesInfo")} />

              {canOfferRemoteDelete && shareDel && (
                <Alert color="warning" title={t("versions.hostInfo")} />
              )}

              {fullDel && (
                <Alert
                  color="danger"
                  title={t("versions.completeRemovalInfo")}
                />
              )}
            </div>

            <div className="flex flex-col gap-2 items-center">
              <Checkbox
                isDisabled={isLoading}
                isSelected={fullDel}
                onChange={() => setFullDel((prev) => !prev)}
              >
                {t("versions.completeRemoval")}
              </Checkbox>

              {canOfferRemoteDelete && (
                <Checkbox
                  isSelected={shareDel}
                  isDisabled={isLoading || !isNetwork}
                  onChange={() => setShareDel((prev) => !prev)}
                >
                  {t("versions.versionShareDel")}
                </Checkbox>
              )}
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <div className="flex gap-2 items-center justify-center">
            <Button
              variant="flat"
              startContent={<ArrowLeft size={22} />}
              isDisabled={isLoading}
              onPress={() => close()}
            >
              {t("versions.willReturn")}
            </Button>

            <Button
              color="danger"
              variant="flat"
              startContent={<Trash size={22} />}
              isLoading={isLoading}
              isDisabled={!version || !account || !versionKey}
              onPress={async () => {
                if (!version || !account || !versionKey) return;

                setIsLoading(true);

                try {
                  if (canDeleteRemote && version.version.shareCode) {
                    const token = account.accessToken || "";
                    await api.backend.deleteModpack(
                      token,
                      version.version.shareCode,
                    );
                  }

                  setConsoles((prev) => ({
                    consoles: prev.consoles.filter(
                      (c) => c.versionName !== version.version.name,
                    ),
                  }));

                  await version.delete(fullDel);

                  setVersions((prev) =>
                    prev.filter((v) => {
                      const sameName = v.version.name === versionKey.name;
                      const samePath =
                        versionKey.path && v.versionPath
                          ? v.versionPath === versionKey.path
                          : false;
                      return !(
                        sameName &&
                        (!versionKey.path || samePath || true)
                      );
                    }),
                  );

                  addToast({
                    color: "success",
                    title: t("versions.deleted"),
                  });

                  close(true);
                } catch {
                  addToast({
                    color: "danger",
                    title: t("versions.deleteError"),
                  });
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
