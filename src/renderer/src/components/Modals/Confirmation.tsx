import { useMemo, useState } from "react"; // Изменено: добавили useMemo/useState
import {
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { useTranslation } from "react-i18next";

export function Confirmation({
  onClose,
  title,
  content,
  buttons,
}: {
  onClose: () => void;
  title?: string;
  content: {
    text: string;
    color?:
      | "primary"
      | "danger"
      | "success"
      | "warning"
      | "default"
      | "secondary";
  }[];
  buttons: {
    text: string;
    color?:
      | "primary"
      | "danger"
      | "success"
      | "warning"
      | "default"
      | "secondary";
    loading?: boolean;
    onClick: () => Promise<void> | void;
  }[];
}) {
  const { t } = useTranslation();

  const [activeBtn, setActiveBtn] = useState<number | null>(null);

  const isBusy = useMemo(
    () => activeBtn !== null || buttons.some((b) => !!b.loading),
    [activeBtn, buttons],
  );

  return (
    <Modal
      isOpen={true}
      onClose={() => {
        if (isBusy) return;
        onClose();
      }}
      isDismissable={!isBusy}
      isKeyboardDismissDisabled={isBusy}
    >
      <ModalContent>
        <ModalHeader>{title || t("common.confirmation")}</ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {content.map((c, index) => (
                <Alert key={index} color={c.color} title={c.text} />
              ))}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <div className="flex items-center gap-2">
            {buttons.map((b, index) => (
              <Button
                color={b.color}
                variant="flat"
                key={index}
                isLoading={b.loading || activeBtn === index}
                isDisabled={isBusy && activeBtn !== index}
                onPress={async () => {
                  if (isBusy && activeBtn !== index) return;
                  try {
                    setActiveBtn(index);
                    await b.onClick();
                  } finally {
                    setActiveBtn(null);
                  }
                }}
              >
                {b.text}
              </Button>
            ))}
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
