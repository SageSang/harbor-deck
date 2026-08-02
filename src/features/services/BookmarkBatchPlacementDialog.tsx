import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ModalShell'
import type { NavigationConfig } from '@/config/schema'
import type { BookmarkPlacement } from '@/features/navigation/navigationConfig'
import { useI18n } from '@/i18n/runtime'

interface BookmarkBatchPlacementDialogProps {
  open: boolean
  navigation?: NavigationConfig
  selectedSlugs: string[]
  activeSceneId?: string | null
  sceneTokens: Record<string, string>
  saving?: boolean
  onClose: () => void
  onConfirm: (placements: BookmarkPlacement[]) => void
}

export function BookmarkBatchPlacementDialog({
  open,
  navigation,
  selectedSlugs,
  sceneTokens,
  saving,
  onClose,
  onConfirm,
}: BookmarkBatchPlacementDialogProps) {
  const { messages } = useI18n()
  const availableScenes = useMemo(
    () =>
      navigation?.scenes.filter((scene) => !scene.protected || Boolean(sceneTokens[scene.id])) ?? [],
    [navigation, sceneTokens]
  )
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({})
  const [collapsedSceneIds, setCollapsedSceneIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || availableScenes.length === 0) return
    // Do not preselect a group. A preselected active-scene group can cause an
    // accidental placement when the user intended to choose another scene.
    setSelectedGroups({})
    // The target list can be very long. Start with every scene folded and let
    // the user open only the scene they want to place into.
    setCollapsedSceneIds(new Set(availableScenes.map((scene) => scene.id)))
  }, [availableScenes, open])

  function toggleGroup(sceneId: string, groupId: string) {
    setSelectedGroups((current) => {
      if (current[sceneId] === groupId) {
        const next = { ...current }
        delete next[sceneId]
        return next
      }
      return { ...current, [sceneId]: groupId }
    })
  }

  const placements = Object.entries(selectedGroups).map(([sceneId, groupId]) => ({
    sceneId,
    groupId,
  }))

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={messages.serviceGrid.batchAddTitle}
      description={messages.serviceGrid.batchAddDescription}
      icon={Layers3}
      widthClassName="max-w-2xl"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="config-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-4 sm:px-5">
          {availableScenes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              {messages.common.noServices}
            </p>
          ) : (
            availableScenes.map((scene) => (
              <section key={scene.id} className="rounded-2xl border border-border/70 bg-card/60 p-3">
                <button
                  type="button"
                  aria-expanded={!collapsedSceneIds.has(scene.id)}
                  onClick={() =>
                    setCollapsedSceneIds((current) => {
                      const next = new Set(current)
                      if (next.has(scene.id)) {
                        next.delete(scene.id)
                      } else {
                        next.add(scene.id)
                      }
                      return next
                    })
                  }
                  className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                >
                  <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{scene.name}</h3>
                  {selectedGroups[scene.id] ? (
                    <span className="text-xs text-primary">{messages.common.itemCount(1)}</span>
                  ) : null}
                  {collapsedSceneIds.has(scene.id) ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-primary/75" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-primary/75" aria-hidden="true" />
                  )}
                </button>
                {!collapsedSceneIds.has(scene.id) ? (
                  scene.groups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{messages.serviceGrid.dropHint}</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {scene.groups.map((group) => {
                        const selected = selectedGroups[scene.id] === group.id
                        return (
                          <button
                            key={group.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleGroup(scene.id, group.id)}
                            className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-left text-sm transition ${selected ? 'border-primary/55 bg-primary/10 text-foreground ring-2 ring-primary/10' : 'border-border/70 bg-background/60 text-muted-foreground hover:border-primary/30 hover:bg-accent/60 hover:text-foreground'}`}
                          >
                            <span className="truncate">{group.name}</span>
                            <span className="ml-2 shrink-0 text-xs opacity-70">
                              {messages.common.itemCount(group.bookmarkIds.length)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                ) : null}
              </section>
            ))
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-border/65 bg-background/80 px-3.5 py-3 sm:flex-row sm:justify-end sm:px-5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {messages.common.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={placements.length === 0 || selectedSlugs.length === 0 || saving}
            onClick={() => onConfirm(placements)}
          >
            {messages.serviceGrid.batchAddActionWithCount(selectedSlugs.length)}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
