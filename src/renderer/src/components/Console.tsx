import { IConsole } from "@/types/Console";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ScrollShadow,
  Tooltip,
  Alert,
} from "@heroui/react";
import { RunGameParams } from "@renderer/App";
import { consolesAtom, versionsAtom } from "@renderer/stores/atoms";
import clsx from "clsx";
import { useAtom } from "jotai";
import { Play, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";

const api = window.api;

interface IInstance {
  versionName: string;
  instance: number;
}

export function Console({
  onClose,
  runGame,
}: {
  onClose: () => void;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const [consoles, setConsoles] = useAtom(consolesAtom);
  const [versions] = useAtom(versionsAtom);
  const [selectedInstance, setSelectedInstance] = useState<IInstance | null>(
    null,
  );
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({});

  const { t } = useTranslation();

  const viewportRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const consolesRef = useRef(consoles.consoles);
  useEffect(() => {
    consolesRef.current = consoles.consoles;
  }, [consoles.consoles]);

  const getKey = (v: string, i: number) => `${v}::${i}`;

  const instances = useMemo<IInstance[]>(() => {
    return consoles.consoles.map((c) => ({
      versionName: c.versionName,
      instance: c.instance,
    }));
  }, [consoles.consoles]);

  const selectedConsole = useMemo<IConsole | null>(() => {
    if (!selectedInstance) return null;
    return (
      consoles.consoles.find(
        (c) =>
          c.versionName === selectedInstance.versionName &&
          c.instance === selectedInstance.instance,
      ) || null
    );
  }, [selectedInstance, consoles.consoles]);

  useEffect(() => {
    if (instances.length === 0) {
      setSelectedInstance(null);
      return;
    }

    const currentKey = selectedInstance
      ? getKey(selectedInstance.versionName, selectedInstance.instance)
      : null;
    const exists = currentKey
      ? instances.some((i) => getKey(i.versionName, i.instance) === currentKey)
      : false;

    if (exists) return;

    const running = consoles.consoles.find((c) => c.status === "running");
    if (running) {
      setSelectedInstance({
        versionName: running.versionName,
        instance: running.instance,
      });
      return;
    }

    setSelectedInstance(instances[0]);
  }, [instances, consoles.consoles, selectedInstance]);

  useEffect(() => {
    const interval = setInterval(() => {
      const list = consolesRef.current;
      const next: Record<string, string> = {};

      list.forEach(({ versionName, instance, startTime, status }) => {
        if (status !== "running" || !startTime) return;

        const diff = Date.now() - new Date(startTime).getTime();
        const seconds = Math.floor(diff / 1000) % 60;
        const minutes = Math.floor(diff / 1000 / 60) % 60;
        const hours = Math.floor(diff / 1000 / 60 / 60);

        next[getKey(versionName, instance)] =
          `${hours.toString().padStart(2, "0")}:` +
          `${minutes.toString().padStart(2, "0")}:` +
          `${seconds.toString().padStart(2, "0")}`;
      });

      setElapsedTimes(next);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  function scrollToBottom() {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }

  function handleScroll() {
    const el = viewportRef.current;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceToBottom < 60;
  }

  useLayoutEffect(() => {
    if (!viewportRef.current) return;
    if (pinnedToBottomRef.current) scrollToBottom();
  }, [selectedInstance, selectedConsole?.messages.length]);

  async function removeConsole(inst: IInstance) {
    const next = consoles.consoles.filter(
      (c) =>
        !(c.versionName === inst.versionName && c.instance === inst.instance),
    );
    setConsoles({ consoles: next });
    if (next.length === 0) onClose();
  }

  function getTipsForConsole(c: IConsole) {
    const tips = c.messages.map((m) => m.tips).flat();
    return Array.from(new Set(tips));
  }

  return (
    <Modal
      isOpen={true}
      size="5xl"
      onClose={() => {
        onClose();
      }}
    >
      <ModalContent>
        <ModalHeader>{t("console.title")}</ModalHeader>

        <ModalBody>
          <div className="flex items-center space-x-2 h-96">
            <div className="flex flex-col w-4/12 h-full">
              <ScrollShadow className="w-full h-full">
                {instances.length === 0 ? (
                  <div className="p-2">
                    <Alert title={t("console.noInstances") || "No instances"} />
                  </div>
                ) : (
                  instances.map((inst) => {
                    const versionItem = versions.find(
                      (v) => v.version.name === inst.versionName,
                    );
                    const versionConsole = consoles.consoles.find(
                      (c) =>
                        c.versionName === inst.versionName &&
                        c.instance === inst.instance,
                    );

                    if (!versionItem || !versionConsole) return null;

                    const isSelected =
                      selectedInstance?.versionName === inst.versionName &&
                      selectedInstance.instance === inst.instance;

                    const tipCodes = getTipsForConsole(versionConsole);
                    const tipText = tipCodes
                      .map((tip) => t(`tips.${tip}`))
                      .join(", ");

                    return (
                      <Card
                        key={getKey(inst.versionName, inst.instance)}
                        className={clsx(
                          "w-full mb-2 border-1",
                          isSelected
                            ? "border-primary-200"
                            : "border-white/20 ",
                        )}
                        isPressable
                        onPress={() => {
                          setSelectedInstance(inst);
                          pinnedToBottomRef.current = true;
                          requestAnimationFrame(scrollToBottom);
                        }}
                      >
                        <CardBody>
                          <div className="flex items-center justify-between space-x-2 w-full">
                            <div className="flex items-center space-x-2 min-w-0">
                              {versionItem.version.image && (
                                <Image
                                  src={versionItem.version.image}
                                  alt={inst.versionName}
                                  width={32}
                                  height={32}
                                  className="min-w-8 min-h-8"
                                />
                              )}

                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center space-x-1">
                                  <p className="text-sm truncate flex-grow">
                                    {versionItem.version.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    [{inst.instance}]
                                  </p>
                                </div>

                                {versionConsole.status === "running" && (
                                  <span className="text-xs text-gray-500">
                                    {elapsedTimes[
                                      getKey(inst.versionName, inst.instance)
                                    ] || "00:00:00"}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              <Tooltip
                                isDisabled={tipCodes.length === 0}
                                content={tipText}
                                size="sm"
                              >
                                <Chip
                                  size="sm"
                                  className={
                                    tipCodes.length ? "cursor-help" : ""
                                  }
                                  variant="dot"
                                  color={
                                    versionConsole.status === "running"
                                      ? "success"
                                      : versionConsole.status === "stopped"
                                        ? "warning"
                                        : "danger"
                                  }
                                >
                                  {versionConsole.status === "running"
                                    ? t("console.running")
                                    : versionConsole.status === "stopped"
                                      ? t("console.stopped")
                                      : t("console.error")}
                                </Chip>
                              </Tooltip>

                              <div className="flex items-center space-x-1">
                                {versionConsole.status === "running" ? (
                                  <Button
                                    isIconOnly
                                    variant="flat"
                                    size="sm"
                                    color="danger"
                                    onPress={async () => {
                                      setSelectedInstance(inst);
                                      await api.game.closeGame(
                                        inst.versionName,
                                        inst.instance,
                                      );
                                    }}
                                  >
                                    <Square size={22} />
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      isIconOnly
                                      variant="flat"
                                      size="sm"
                                      color="secondary"
                                      onPress={async () => {
                                        setSelectedInstance(inst);
                                        await runGame({
                                          version: versionItem,
                                          instance: inst.instance,
                                        });
                                      }}
                                    >
                                      <Play size={22} />
                                    </Button>

                                    <Button
                                      isIconOnly
                                      variant="flat"
                                      size="sm"
                                      color="warning"
                                      onPress={async () => {
                                        await removeConsole(inst);
                                      }}
                                    >
                                      <X size={22} />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    );
                  })
                )}
              </ScrollShadow>
            </div>

            <div className="w-8/12 h-full">
              <Card className="h-full bg-gray-900 border-none shadow-lg">
                <CardBody className="h-full p-0">
                  <div
                    ref={viewportRef}
                    onScroll={handleScroll}
                    className="w-full h-full overflow-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-800"
                  >
                    {selectedConsole?.messages.map((message, index) => {
                      const text = message.message.length
                        ? message.message
                        : " ";

                      return (
                        <Tooltip
                          size="sm"
                          key={index}
                          isDisabled={message.tips.length === 0}
                          content={message.tips
                            .map((tip) => t("tips." + tip))
                            .join(", ")}
                        >
                          <pre
                            style={{ tabSize: 4 }}
                            className={`m-0 p-2 text-xs font-mono whitespace-pre border-l-4 ${
                              message.tips.length > 0 ? "cursor-help" : ""
                            } ${
                              message.type === "info"
                                ? "bg-blue-950/50 text-blue-300 border-blue-500"
                                : message.type === "error"
                                  ? "bg-red-950/50 text-red-300 border-red-500"
                                  : "bg-green-950/50 text-green-300 border-green-500"
                            } first:pt-2 last:pb-2 transition-colors duration-200 hover:bg-opacity-75`}
                          >
                            {text}
                          </pre>
                        </Tooltip>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
