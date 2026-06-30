import { IUpdateProject } from '@/types/ModManager'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Compass, FileBox, Loader2, RefreshCw } from 'lucide-react'
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined}
        className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0 sm:max-w-xl"
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault()
        }}
      >
        <DialogHeader className="border-b py-4 pr-12 pl-5">
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-5" />
            {t('modManager.updatingMods')}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 px-5 py-4">
          <ScrollArea className="h-[min(24rem,calc(100vh-13rem))] min-h-16 w-full pr-3">
            <div className="flex w-full flex-col gap-2">
              {projects.map((p) => {
                const isSelected = selected.has(p.project.id)

                return (
                  <Card
                    key={p.project.id}
                    className="gap-0 overflow-hidden py-0 shadow-none transition-colors hover:bg-accent/35"
                  >
                    <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3">
                      <Checkbox
                        className="cursor-pointer"
                        disabled={isLoading}
                        checked={isSelected}
                        onCheckedChange={(checked) => toggle(p.project.id, checked === true)}
                      />

                      <button
                        type="button"
                        className="grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isLoading}
                        aria-pressed={isSelected}
                        onClick={() => toggle(p.project.id, !isSelected)}
                      >
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 text-muted-foreground">
                          {p.project.iconUrl ? (
                            <img
                              height={48}
                              width={48}
                              className="h-full w-full object-cover"
                              src={p.project.iconUrl}
                              alt={p.project.title}
                            />
                          ) : (
                            <FileBox className="size-5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground" title={p.project.title}>
                            {p.project.title}
                          </p>

                          {p.project.description && (
                            <p className="line-clamp-2 min-w-0 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                              {p.project.description}
                            </p>
                          )}
                        </div>
                      </button>

                      {p.project.url && (
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          disabled={isLoading}
                          aria-label={p.project.title}
                          title={p.project.title}
                          onClick={() => api.shell.openExternal(p.project.url!)}
                        >
                          <Compass size={20} />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-2 rounded-none rounded-b-xl border-t bg-muted/25 px-5 py-4 sm:gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>

          <Button
            disabled={isLoading || selectedCount === 0}
            onClick={handleUpdate}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {t('common.update')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
