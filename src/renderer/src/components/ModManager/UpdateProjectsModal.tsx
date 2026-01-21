import { IUpdateProject } from '@/types/ModManager'
import {
  Button,
  Checkbox,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow
} from '@heroui/react'
import { Compass } from 'lucide-react'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

const api = window.api

export function UPModal({
  onClose,
  projects,
  updateProjects
}: {
  onClose: () => void
  projects: IUpdateProject[]
  updateProjects: (projects: IUpdateProject[]) => void | Promise<void>
}) {
  const { t } = useTranslation()

  const [isLoading, setIsLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    const initial = new Set(projects.map((p) => p.project.id))
    setSelected(initial)
  }, [projects])

  const selectedCount = selected.size

  const selectedProjects = useMemo(() => {
    if (selected.size === 0) return []
    return projects.filter((p) => selected.has(p.project.id))
  }, [projects, selected])

  const toggle = useCallback((id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (isSelected) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleUpdate = useCallback(async () => {
    if (isLoading || selected.size === 0) return

    setIsLoading(true)
    try {
      await updateProjects(selectedProjects)
      onClose()
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, selected.size, updateProjects, selectedProjects, onClose, selected])

  return (
    <Modal isOpen onClose={() => (!isLoading ? onClose() : undefined)} size="xl">
      <ModalContent>
        <ModalHeader>{t('modManager.updatingMods')}</ModalHeader>

        <ModalBody>
          <ScrollShadow className="w-full h-full min-h-16 max-h-96 pr-2">
            <div className="flex flex-col gap-2 w-full">
              {projects.map((p) => {
                return (
                  <div className="flex items-center justify-between w-full">
                    <Checkbox
                      isDisabled={isLoading}
                      isSelected={selected.has(p.project.id)}
                      onValueChange={(checked) => toggle(p.project.id, checked)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {p.project.iconUrl && (
                          <Image
                            height={48}
                            width={48}
                            className="min-h-12 min-w-12"
                            src={p.project.iconUrl}
                            alt={p.project.title}
                          />
                        )}

                        <div className="flex flex-col min-w-0">
                          <p>{p.project.title}</p>

                          {p.project.description && (
                            <p className="text-xs text-gray-400 truncate flex-grow max-w-96">
                              {p.project.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </Checkbox>

                    {p.project.url && (
                      <Button
                        size="sm"
                        variant="flat"
                        isIconOnly
                        isDisabled={isLoading}
                        onPress={() => api.shell.openExternal(p.project.url!)}
                      >
                        <Compass size={20} />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollShadow>
        </ModalBody>

        <ModalFooter>
          <Button
            variant="flat"
            color="success"
            isDisabled={isLoading || selectedCount === 0}
            isLoading={isLoading}
            onPress={handleUpdate}
          >
            {t('common.update')}
          </Button>

          <Button variant="flat" onPress={onClose} isDisabled={isLoading}>
            {t('common.cancel')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
