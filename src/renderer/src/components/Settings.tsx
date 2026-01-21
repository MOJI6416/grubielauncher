import { useEffect, useState } from 'react'

const api = window.api

import { useTranslation } from 'react-i18next'
import ReactCountryFlag from 'react-country-flag'
import { Save } from 'lucide-react'
import { useAtom } from 'jotai'
import { pathsAtom, settingsAtom } from '@renderer/stores/atoms'
import {
  addToast,
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Select,
  SelectItem,
  Slider
} from '@heroui/react'
import { LANGUAGES } from '@/types/Settings'

export function Settings({ onClose }: { onClose: () => void }) {
  const [xmx, setXmx] = useState(2048)
  const [settingsPath, setSettingsPath] = useState('')
  const [lang, setLang] = useState('')
  const [devMode, setDevMode] = useState(false)
  const [settings, setSettings] = useAtom(settingsAtom)
  const { t, i18n } = useTranslation()
  const [version, setVersion] = useState('')
  const [downloadLimit, setDownloadLimit] = useState(6)
  const [totalMem, setTotalMem] = useState(0)
  const [paths] = useAtom(pathsAtom)

  useEffect(() => {
    setXmx(settings.xmx)
    setDevMode(settings.devMode)
    setDownloadLimit(settings.downloadLimit || 6)
    setLang(settings.lang || i18n.language)
  }, [settings])

  useEffect(() => {
    let cancelled = false

    const loadSystemInfo = async () => {
      const [v, mem] = await Promise.all([api.other.getVersion(), api.os.totalmem()])

      if (!cancelled) {
        setVersion(v)
        setTotalMem(mem)
        setSettingsPath(await api.path.join(paths.launcher, 'settings.json'))
      }
    }

    loadSystemInfo()
    return () => {
      cancelled = true
    }
  }, [paths])

  return (
    <>
      <Modal
        isOpen={true}
        onClose={() => {
          setLang(settings.lang)
          i18n.changeLanguage(settings.lang)
          onClose()
        }}
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center space-x-4">
              <p className="text-lg font-bold">{t('settings.title')}</p>
              <p className="text-xs">
                {t('settings.launcherBuild')}: {version}
              </p>
            </div>
          </ModalHeader>

          <ModalBody>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Slider
                  label={t('settings.memory')}
                  size="sm"
                  step={512}
                  value={xmx}
                  onChange={(value) => {
                    if (typeof value == 'number') {
                      setXmx(Number(value.toFixed(0)))
                    }
                  }}
                  minValue={1024}
                  renderValue={(value) => {
                    return `${value.children?.toString()} ${t('settings.mb')}`
                  }}
                  maxValue={totalMem / (1024 * 1024)}
                ></Slider>
              </div>

              <Select
                label={t('settings.language')}
                selectedKeys={[lang]}
                onChange={(event) => {
                  const value = event.target.value
                  if (!value) return

                  setLang(value)
                  i18n.changeLanguage(value)
                }}
                renderValue={(item) => {
                  const selected = LANGUAGES.find((l) => l.code == item[0].key)
                  return (
                    <div key={item[0].key} className="flex gap-2 items-center">
                      {selected?.country && (
                        <ReactCountryFlag svg={true} countryCode={selected?.country} />
                      )}
                      <p>{selected?.label}</p>
                    </div>
                  )
                }}
              >
                {LANGUAGES.map((l) => {
                  return (
                    <SelectItem key={l.code}>
                      <div className="flex gap-2 items-center">
                        <ReactCountryFlag svg={true} countryCode={l.country} />
                        <p>{l.label}</p>
                      </div>
                    </SelectItem>
                  )
                })}
              </Select>

              <NumberInput
                label={t('settings.downloadLimit')}
                size="sm"
                minValue={1}
                maxValue={16}
                value={downloadLimit}
                onValueChange={setDownloadLimit}
              />

              <div className="flex items-center gap-2">
                <Checkbox isSelected={devMode} onChange={() => setDevMode((prev) => !prev)}>
                  {t('settings.devMode')}
                </Checkbox>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="success"
              variant="flat"
              startContent={<Save size={22} />}
              isDisabled={
                settings.xmx == xmx &&
                settings.lang == lang &&
                settings.devMode == devMode &&
                settings.downloadLimit == downloadLimit
              }
              onPress={async () => {
                const newSettings = {
                  ...settings,
                  xmx,
                  lang,
                  devMode,
                  downloadLimit
                }

                await api.fs.writeJSON(settingsPath, newSettings)

                setSettings(newSettings)
                addToast({
                  title: t('settings.saved'),
                  color: 'success'
                })
              }}
            >
              {t('common.save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
