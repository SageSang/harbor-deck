import { useEffect, useMemo, useState } from 'react'
import { Bookmark, Check, Pencil } from 'lucide-react'
import {
  isHttpUrl,
  type NavigationConfig,
  type QuickRecord,
  type ServiceConfig,
} from '@/config/schema'
import { ModalShell } from '@/components/ModalShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFeedback } from '@/features/feedback/useFeedback'
import { useNavigationConfig, useSaveNavigationConfig } from '@/features/navigation/useNavigation'
import {
  buildUniqueNavigationId,
  getBookmarkPlacements,
  removeQuickRecordFromScene,
  upsertBookmark,
  upsertQuickRecord,
} from '@/features/navigation/navigationConfig'
import { cleanServiceConfig } from '@/features/services/servicesConfig'
import { formatBookmarkError } from '@/features/services/bookmarkForm'
import { bookmarkMatchesAnyUrl } from '@/features/services/bookmarkUrl'
import { getRandomBookmarkIcon } from '@/features/services/randomBookmarkIcon'
import { useAppStore } from '@/store/appStore'

interface QuickRecordEditDialogProps {
  open: boolean
  config?: NavigationConfig
  sceneId: string | null
  recordId: string | null
  onClose: () => void
}

interface PlacementChoice {
  sceneId: string
  groupId: string
}

function findRecord(
  config: NavigationConfig | undefined,
  sceneId: string | null,
  recordId: string | null
) {
  if (!config || !sceneId || !recordId) return undefined
  return config.scenes
    .find((scene) => scene.id === sceneId)
    ?.quickRecords?.find((record) => record.id === recordId)
}

export function QuickRecordEditDialog({
  open,
  config,
  sceneId,
  recordId,
  onClose,
}: QuickRecordEditDialogProps) {
  const navigationQuery = useNavigationConfig()
  const saveMutation = useSaveNavigationConfig()
  const sceneTokens = useAppStore((state) => state.sceneTokens)
  const { showToast } = useFeedback()
  const navigation = config ?? navigationQuery.data
  const record = findRecord(navigation, sceneId, recordId)
  const editableScenes = useMemo(
    () =>
      navigation?.scenes.filter((scene) => !scene.protected || Boolean(sceneTokens[scene.id])) ??
      [],
    [navigation, sceneTokens]
  )
  const [name, setName] = useState('')
  const [primaryUrl, setPrimaryUrl] = useState('')
  const [secondaryUrl, setSecondaryUrl] = useState('')
  const [note, setNote] = useState('')
  const [placements, setPlacements] = useState<PlacementChoice[]>([])
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!open || !record) return
    setName(record.name)
    setPrimaryUrl(record.primaryUrl)
    setSecondaryUrl(record.secondaryUrl ?? '')
    setNote(record.note ?? '')
    setPlacements([])
    setFeedback('')
  }, [open, record])

  function togglePlacement(next: PlacementChoice) {
    setPlacements((current) => {
      const existing = current.findIndex((item) => item.sceneId === next.sceneId)
      if (existing >= 0 && current[existing].groupId === next.groupId) {
        return current.filter((_, index) => index !== existing)
      }
      return [...current.filter((item) => item.sceneId !== next.sceneId), next]
    })
  }

  function submit() {
    if (!navigation || !record || !sceneId) return
    const trimmedName = name.trim()
    const trimmedPrimary = primaryUrl.trim()
    if (!trimmedName || !trimmedPrimary) {
      setFeedback('请填写名称和主地址。')
      return
    }
    const trimmedSecondary = secondaryUrl.trim()
    if (!isHttpUrl(trimmedPrimary) || (trimmedSecondary && !isHttpUrl(trimmedSecondary))) {
      setFeedback('请输入有效的网址。')
      return
    }

    const now = Date.now()
    const trimmedNote = note.trim()
    const nextRecord: QuickRecord = {
      ...record,
      name: trimmedName,
      primaryUrl: trimmedPrimary,
      secondaryUrl: trimmedSecondary || undefined,
      note: trimmedNote || undefined,
      updatedAt: now,
    }
    let next: NavigationConfig
    try {
      if (placements.length === 0) {
        next = upsertQuickRecord(navigation, sceneId, nextRecord, record.id)
      } else {
        const existing = navigation.bookmarks.find((bookmark) =>
          bookmarkMatchesAnyUrl(bookmark, [trimmedPrimary, trimmedSecondary])
        )
        const service: ServiceConfig =
          existing ??
          cleanServiceConfig({
            slug: buildUniqueNavigationId(
              trimmedName,
              navigation.bookmarks.map((bookmark) => bookmark.slug),
              'bookmark'
            ),
            name: trimmedName,
            note: note.trim(),
            icon: record.icon ?? getRandomBookmarkIcon(),
            primaryUrl: trimmedPrimary,
            secondaryUrl: secondaryUrl.trim(),
            forceNewTab: false,
          })
        next = removeQuickRecordFromScene(navigation, sceneId, record.id)
        const existingPlacements = existing ? getBookmarkPlacements(navigation, existing.slug) : []
        next = upsertBookmark(next, service, [
          ...existingPlacements,
          ...placements.filter(
            (placement) => !existingPlacements.some((item) => item.sceneId === placement.sceneId)
          ),
        ])
      }
    } catch (error) {
      setFeedback(formatBookmarkError(error))
      return
    }

    saveMutation.mutate(next, {
      onSuccess: () => {
        showToast({
          type: 'success',
          message: placements.length > 0 ? '记录已转为书签。' : '记录已保存。',
        })
        onClose()
      },
      onError: (error) =>
        setFeedback(error instanceof Error ? error.message : '保存失败，请重试。'),
    })
  }

  if (!record) return null

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="编辑快速记录"
      description="不选择分组会继续作为快速记录；选择分组后会转为普通书签。"
      icon={Pencil}
      widthClassName="max-w-2xl"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="config-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          <label className="config-panel-card-muted block space-y-1.5 p-3">
            <span className="text-xs font-semibold text-muted-foreground">名称</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <label className="config-panel-card-muted block space-y-1.5 p-3">
            <span className="text-xs font-semibold text-muted-foreground">主地址</span>
            <Input value={primaryUrl} onChange={(event) => setPrimaryUrl(event.target.value)} />
          </label>
          <label className="config-panel-card-muted block space-y-1.5 p-3">
            <span className="text-xs font-semibold text-muted-foreground">备用地址（可选）</span>
            <Input value={secondaryUrl} onChange={(event) => setSecondaryUrl(event.target.value)} />
          </label>
          <label className="config-panel-card-muted block space-y-1.5 p-3">
            <span className="text-xs font-semibold text-muted-foreground">备注（可选）</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="config-panel-textarea"
            />
          </label>
          <div className="config-panel-card-muted space-y-2 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bookmark className="h-4 w-4 text-primary" />
              保存到分组（可选）
            </div>
            <p className="text-xs text-muted-foreground">
              每个场景最多选择一个分组；不选择任何分组则保持为快速记录。
            </p>
            <div className="space-y-2">
              {editableScenes.map((scene) => (
                <div
                  key={scene.id}
                  className="rounded-xl border border-border/70 bg-background/55 p-2"
                >
                  <div className="mb-1.5 text-xs font-semibold text-foreground">{scene.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {scene.groups.map((group) => {
                      const selected = placements.some(
                        (placement) =>
                          placement.sceneId === scene.id && placement.groupId === group.id
                      )
                      return (
                        <button
                          key={group.id}
                          type="button"
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 hover:border-primary/45'}`}
                          onClick={() => togglePlacement({ sceneId: scene.id, groupId: group.id })}
                        >
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          {group.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border/65 p-3 sm:p-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saveMutation.isPending}
          >
            取消
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            保存
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
