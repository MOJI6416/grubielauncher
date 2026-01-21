import { IAddedLocalProject, IProject } from '@/types/ModManager'
import {
  Button,
  Checkbox,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  Tooltip
} from '@heroui/react'
import { Compass } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const api = window.api

export function ALPModal({
  onClose,
  projects,
  addProjects
}: {
  onClose: () => void
  projects: IAddedLocalProject[]
  addProjects: (projects: IProject[]) => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<'add' | null>(null)
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])

  const { t } = useTranslation()

  useEffect(() => {
    const initialSelected = projects
      .filter((project) => project.status === 'valid')
      .map((project) => project.project.id)
    setSelectedProjects(initialSelected)
  }, [projects])

  return (
    <>
      <Modal isOpen onClose={onClose} size="xl">
        <ModalContent>
          <ModalHeader>{t('modManager.addingProjects')}</ModalHeader>
          <ModalBody>
            <ScrollShadow className="w-full h-full min-h-16 max-h-96 pr-2">
              <div className="flex flex-col gap-2 w-full">
                {projects.map((project, index) => (
                  <Tooltip
                    key={index}
                    size="sm"
                    content={
                      project.status === 'duplicate'
                        ? t('modManager.modDuplicate')
                        : project.status === 'invalid'
                          ? t('modManager.modInvalid')
                          : ''
                    }
                    color={
                      project.status === 'valid'
                        ? 'primary'
                        : project.status === 'duplicate'
                          ? 'warning'
                          : 'danger'
                    }
                    isDisabled={project.status === 'valid'}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Checkbox
                        isDisabled={project.status !== 'valid'}
                        isSelected={selectedProjects.includes(project.project.id)}
                        onValueChange={(isSelected) => {
                          if (isSelected) {
                            setSelectedProjects([...selectedProjects, project.project.id])
                          } else {
                            setSelectedProjects(
                              selectedProjects.filter((id) => id !== project.project.id)
                            )
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {project.project.iconUrl && (
                            <Image
                              height={48}
                              width={48}
                              className="min-h-12 min-w-12"
                              src={project.project.iconUrl!}
                            />
                          )}
                          <div className="flex flex-col">
                            <p
                              className={`${project.status === 'duplicate' ? 'text-warning' : project.status === 'invalid' ? 'text-danger' : ''}`}
                            >
                              {project.project.title}
                            </p>
                            <p className="text-xs text-gray-400 truncate flex-grow max-w-96">
                              {project.project.description}
                            </p>
                          </div>
                        </div>
                      </Checkbox>

                      {project.project.url && (
                        <Button
                          size="sm"
                          variant="flat"
                          isIconOnly
                          onPress={() => api.shell.openExternal(project.project.url!)}
                        >
                          <Compass size={20} />
                        </Button>
                      )}
                    </div>
                  </Tooltip>
                ))}
              </div>
            </ScrollShadow>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              color="success"
              isDisabled={isLoading || selectedProjects.length === 0}
              isLoading={loadingType === 'add'}
              onPress={() => {
                setIsLoading(true)
                setLoadingType('add')

                addProjects(
                  projects
                    .filter((project) => selectedProjects.includes(project.project.id))
                    .map((p) => p.project)
                )

                setIsLoading(false)
                setLoadingType(null)

                onClose()
              }}
            >
              {t('common.add')}
            </Button>
            <Button variant="flat" onPress={onClose} isDisabled={isLoading}>
              {t('common.cancel')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
