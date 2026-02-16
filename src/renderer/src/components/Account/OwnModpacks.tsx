import { IModpack } from "@/types/Backend";
import {
  addToast,
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
} from "@heroui/react";
import { accountAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { Download, Share2, SquarePlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddVersion } from "../Modals/Version/AddVersion";
import { Confirmation } from "../Modals/Confirmation";

const api = window.api;

export function OwnModpacks({
  _modpacks,
  onClose,
}: {
  _modpacks: IModpack[];
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"deleting" | null>(null);
  const [account] = useAtom(accountAtom);

  const [modpacks, setModpacks] = useState(_modpacks);
  const [isAddVersion, setIsAddVersion] = useState(false);
  const [tempModpack, setTempModpack] = useState<IModpack | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  const { t } = useTranslation();

  useEffect(() => {
    setModpacks(_modpacks);
  }, [_modpacks]);

  const handleDelete = useCallback(async () => {
    if (isLoading || !account?.accessToken || !tempModpack) return;

    setIsLoading(true);
    setLoadingType("deleting");

    try {
      const result = await api.backend.deleteModpack(
        account.accessToken,
        tempModpack._id,
      );

      if (result) {
        addToast({
          color: "success",
          title: t("ownModpacks.deleted"),
        });

        setModpacks((prev) => prev.filter((m) => m._id !== tempModpack._id));
        setTempModpack(null);
      } else {
        addToast({
          color: "danger",
          title: t("ownModpacks.deleteError"),
        });
      }
    } catch {
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  }, [tempModpack, isLoading, account?.accessToken, t]);

  return (
    <>
      <Modal isOpen onClose={() => !isLoading && onClose()}>
        <ModalContent>
          <ModalHeader>{t("ownModpacks.title")}</ModalHeader>
          <ModalBody>
            <ScrollShadow className="max-h-96 pr-1">
              {modpacks.length === 0 ? (
                <Alert variant="bordered" title={t("ownModpacks.noModpacks")} />
              ) : (
                <div className="flex flex-col gap-2">
                  {modpacks.map((modpack) => (
                    <Card
                      key={modpack._id}
                      className="border-white/20 border-1"
                    >
                      <CardBody>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 min-w-0">
                            {modpack.conf.image && (
                              <Image
                                src={modpack.conf.image}
                                width={40}
                                height={40}
                                loading="lazy"
                                className="min-w-10 min-h-10"
                              />
                            )}
                            <p className="truncate text-sm">
                              {modpack.conf.name}
                            </p>
                          </div>

                          <div className="flex items-center gap-4">
                            <Chip variant="flat" radius="sm">
                              <div className="flex items-center gap-1">
                                <Download size={20} />
                                <p className="text-sm">{modpack.downloads}</p>
                              </div>
                            </Chip>

                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="flat"
                                isIconOnly
                                onPress={async () => {
                                  await api.clipboard.writeText(modpack._id);
                                  addToast({
                                    title: t("common.copied"),
                                  });
                                }}
                              >
                                <Share2 size={20} />
                              </Button>

                              <Button
                                size="sm"
                                variant="flat"
                                color="primary"
                                isDisabled={isLoading}
                                isIconOnly
                                onPress={() => {
                                  setTempModpack(modpack);
                                  setIsAddVersion(true);
                                }}
                              >
                                <SquarePlus size={20} />
                              </Button>

                              <Button
                                size="sm"
                                variant="flat"
                                color="danger"
                                isDisabled={isLoading}
                                isIconOnly
                                onPress={() => {
                                  setTempModpack(modpack);
                                  setIsConfirmationOpen(true);
                                }}
                              >
                                <Trash2 size={20} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollShadow>
          </ModalBody>

          <ModalFooter>
            <Button variant="flat" onPress={onClose} isDisabled={isLoading}>
              {t("common.close")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {isAddVersion && tempModpack && (
        <AddVersion
          closeModal={() => setIsAddVersion(false)}
          modpack={tempModpack}
        />
      )}

      {isConfirmationOpen && tempModpack && (
        <Confirmation
          content={[
            {
              text: t("ownModpacks.confirmation", {
                name: tempModpack.conf.name,
              }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              loading: isLoading && loadingType === "deleting",
              onClick: async () => {
                await handleDelete();
                setIsConfirmationOpen(false);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setIsConfirmationOpen(false),
            },
          ]}
          onClose={() => setIsConfirmationOpen(false)}
        />
      )}
    </>
  );
}
