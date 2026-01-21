import { IConsole } from '@/types/Console'
import {
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
  Tooltip
} from '@heroui/react'
import { RunGameParams } from '@renderer/App'
import { consolesAtom, selectedVersionAtom, versionsAtom } from '@renderer/stores/atoms'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { Play, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const api = window.api

interface IInctance {
  versionName: string
  instance: number
}

export function Console({
  onClose,
  runGame
}: {
  onClose: () => void
  runGame: (params: RunGameParams) => Promise<void>
}) {
  const [consoles, setConsoles] = useAtom(consolesAtom)
  const [versions] = useAtom(versionsAtom)
  const [instances, setInstances] = useState<IInctance[]>([])
  const [selectedVersion] = useAtom(selectedVersionAtom)
  const [selectedConsole, setSelectedConsole] = useState<IConsole | null>(null)
  const [selectedInstance, setSelectedInstance] = useState<IInctance | null>(null)
  const [elapsedTimes, setElapsedTimes] = useState<{ [key: string]: string }>({})

  const ref = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  useEffect(() => {
    const versionNames = consoles.consoles.map((console) => ({
      versionName: console.versionName,
      instance: console.instance
    }))
    setInstances(versionNames)

    if (!selectedConsole) {
      const runningConsole = consoles.consoles.find((console) => console.status === 'running')
      if (runningConsole)
        setSelectedInstance({
          versionName: runningConsole.versionName,
          instance: runningConsole.instance
        })
      else
        setSelectedInstance({
          versionName: versionNames[0].versionName,
          instance: versionNames[0].instance
        })
    }

    const interval = setInterval(() => {
      const newElapsedTimes: { [key: string]: string } = {}

      consoles.consoles.forEach(({ versionName, instance, startTime, status }) => {
        if (status === 'running' && startTime) {
          const diff = Date.now() - new Date(startTime).getTime()
          const seconds = Math.floor(diff / 1000) % 60
          const minutes = Math.floor(diff / 1000 / 60) % 60
          const hours = Math.floor(diff / 1000 / 60 / 60)

          newElapsedTimes[`${versionName}-${instance}`] =
            `${hours.toString().padStart(2, '0')}:` +
            `${minutes.toString().padStart(2, '0')}:` +
            `${seconds.toString().padStart(2, '0')}`
        }
      })

      setElapsedTimes(newElapsedTimes)
    }, 1000)

    if (ref.current) {
      const scrollHeight = ref.current.scrollHeight
      ref.current.scrollTo({
        top: scrollHeight,
        behavior: 'smooth'
      })
    }

    return () => clearInterval(interval)
  }, [consoles, selectedVersion, selectedConsole])

  useEffect(() => {
    if (ref.current) {
      const scrollHeight = ref.current.scrollHeight
      ref.current.scrollTo({
        top: scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [selectedConsole])

  useEffect(() => {
    if (selectedInstance) {
      const selectedConsole = consoles.consoles.find(
        (console) =>
          console.versionName === selectedInstance.versionName &&
          console.instance === selectedInstance.instance
      )
      setSelectedConsole(selectedConsole || null)
    }
  }, [selectedInstance])

  const tips = useMemo(() => {
    if (!selectedInstance) return ''

    const version = versions.find((v) => v.version.name === selectedInstance.versionName)
    const versionConsole = consoles.consoles.find(
      (console) =>
        console.versionName === selectedInstance.versionName &&
        console.instance === selectedInstance.instance
    )

    if (!version || !versionConsole) return ''

    const tips = versionConsole.messages.map((msg) => msg.tips).flat()
    const uniqueTips = Array.from(new Set(tips))
    return uniqueTips.map((tip) => t(`tips.${tip}`)).join(', ')
  }, [selectedInstance, t, consoles, versions])

  return (
    <>
      <Modal
        isOpen={true}
        size="5xl"
        onClose={() => {
          onClose()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('console.title')}</ModalHeader>
          <ModalBody>
            <div className="flex items-center space-x-2 h-96">
              <div className="flex flex-col w-4/12 h-full">
                <ScrollShadow className="w-full h-full">
                  {instances.map((instance, index) => {
                    const version = versions.find((v) => v.version.name === instance.versionName)
                    const versionConsole = consoles.consoles.find(
                      (console) =>
                        console.versionName === instance.versionName &&
                        console.instance === instance.instance
                    )

                    if (!version || !versionConsole) return null

                    return (
                      <Card
                        key={index}
                        className={clsx(
                          'w-full mb-2',
                          selectedConsole?.versionName === instance.versionName &&
                            selectedConsole.instance === instance.instance
                            ? 'border-primary-200 border-1'
                            : 'border-none'
                        )}
                        isPressable
                        onPress={() => {
                          setSelectedInstance(instance)
                        }}
                      >
                        <CardBody>
                          <div className="flex items-center justify-between space-x-2 w-full">
                            <div className="flex items-center space-x-2 min-w-0">
                              {version.version.image && (
                                <Image
                                  src={version.version.image}
                                  alt={instance.versionName}
                                  width={32}
                                  height={32}
                                  className="min-w-8 min-h-8"
                                />
                              )}
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center space-x-1">
                                  <p className="text-sm truncate flex-grow">
                                    {version.version.name}
                                  </p>
                                  <p className="text-xs text-gray-500">[{instance.instance}]</p>
                                </div>
                                {versionConsole.status === 'running' && (
                                  <span className="text-xs text-gray-500">
                                    {elapsedTimes[`${instance.versionName}-${instance.instance}`] ||
                                      '00:00:00'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              <Tooltip isDisabled={tips == ''} content={tips} size="sm">
                                <Chip
                                  size="sm"
                                  className={tips != '' ? 'cursor-help' : ''}
                                  variant="dot"
                                  color={
                                    versionConsole.status == 'running'
                                      ? 'success'
                                      : versionConsole.status == 'stopped'
                                        ? 'warning'
                                        : 'danger'
                                  }
                                >
                                  {versionConsole.status == 'running'
                                    ? t('console.running')
                                    : versionConsole.status == 'stopped'
                                      ? t('console.stopped')
                                      : t('console.error')}
                                </Chip>
                              </Tooltip>
                              <div className="flex items-center space-x-1">
                                {versionConsole.status == 'running' && (
                                  <Button
                                    isIconOnly
                                    variant="flat"
                                    size="sm"
                                    color="danger"
                                    onPress={async () => {
                                      setSelectedInstance(instance)
                                      await api.game.closeGame(
                                        instance.versionName,
                                        instance.instance
                                      )
                                    }}
                                  >
                                    <Square size={22} />
                                  </Button>
                                )}
                                {versionConsole.status != 'running' && (
                                  <>
                                    <Button
                                      isIconOnly
                                      variant="flat"
                                      size="sm"
                                      color="secondary"
                                      onPress={async () => {
                                        setSelectedInstance(instance)
                                        await runGame({
                                          version,
                                          instance: instance.instance
                                        })
                                      }}
                                    >
                                      <Play size={22} />
                                    </Button>
                                    <Button
                                      isIconOnly
                                      variant="flat"
                                      size="sm"
                                      color="warning"
                                      onPress={() => {
                                        const index = consoles.consoles.findIndex(
                                          (console) =>
                                            console.versionName === instance.versionName &&
                                            console.instance === instance.instance
                                        )

                                        if (index !== -1) {
                                          consoles.consoles.splice(index, 1)
                                          setConsoles({ consoles: [...consoles.consoles] })
                                        }

                                        if (
                                          selectedConsole?.versionName === instance.versionName &&
                                          selectedConsole.instance === instance.instance
                                        ) {
                                          setSelectedConsole(null)
                                        }

                                        if (consoles.consoles.length === 0) {
                                          onClose()
                                        }
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
                    )
                  })}
                </ScrollShadow>
              </div>
              <div className="w-8/12 h-full">
                <Card className="h-full bg-gray-900 border-none shadow-lg">
                  <CardBody className="h-full p-0">
                    <div
                      className="w-full h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-800"
                      ref={ref}
                    >
                      {selectedConsole?.messages.map((message, index) => (
                        <Tooltip
                          size="sm"
                          key={index}
                          isDisabled={message.tips.length === 0}
                          content={message.tips.map((tip) => t('tips.' + tip)).join(', ')}
                        >
                          <div
                            className={`p-2 text-xs font-mono break-all border-l-4 ${message.tips.length > 0 ? 'cursor-help' : ''} ${
                              message.type === 'info'
                                ? 'bg-blue-950/50 text-blue-300 border-blue-500'
                                : message.type === 'error'
                                  ? 'bg-red-950/50 text-red-300 border-red-500'
                                  : 'bg-green-950/50 text-green-300 border-green-500'
                            } first:pt-2 last:pb-2 transition-colors duration-200 hover:bg-opacity-75`}
                          >
                            {message.message}
                          </div>
                        </Tooltip>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              </div>
            </div>
          </ModalBody>
          <ModalFooter></ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
