import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { ModalShell } from '@/components/ModalShell'
import type { NavigationConfig } from '@/config/schema'
import { useFeedback } from '@/features/feedback/useFeedback'
import { BookmarkForm } from '@/features/services/BookmarkFormPanel'
import { useI18n } from '@/i18n/runtime'
import {
  buildSuggestedSlug,
  createBookmarkFormFromService,
  formatBookmarkError,
  type BookmarkFormValues,
  validateBookmarkForm,
} from '@/features/services/bookmarkForm'
import { cloneNavigationConfig, createSceneGroup, getBookmarkPlacements, upsertBookmark } from '@/features/navigation/navigationConfig'
import { useNavigationConfig, useSaveNavigationConfig } from '@/features/navigation/useNavigation'
import { useAppStore } from '@/store/appStore'

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

interface BookmarkEditDialogProps {
  open: boolean
  config?: NavigationConfig
  serviceSlug: string | null
  onClose: () => void
}

export function BookmarkEditDialog({ open, config, serviceSlug, onClose }: BookmarkEditDialogProps) {
  const navigationQuery = useNavigationConfig()
  const saveMutation = useSaveNavigationConfig()
  const { showToast } = useFeedback()
  const { messages } = useI18n()
  const sceneTokens = useAppStore((state) => state.sceneTokens)
  const [draft, setDraft] = useState<BookmarkFormValues | null>(null)
  const [slugTouched, setSlugTouched] = useState(true)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const navigation = config ?? navigationQuery.data
  const editableNavigation = useMemo(() => {
    if (!navigation) return undefined
    const scenes = navigation.scenes.filter(
      (scene) => !scene.protected || Boolean(sceneTokens[scene.id])
    )
    if (scenes.length === 0) return undefined
    return {
      ...navigation,
      defaultSceneId: scenes.some((scene) => scene.id === navigation.defaultSceneId)
        ? navigation.defaultSceneId
        : scenes[0].id,
      scenes,
    }
  }, [navigation, sceneTokens])
  const activeService = navigation?.bookmarks.find((bookmark) => bookmark.slug === serviceSlug)

  useEffect(() => {
    if (!open || !editableNavigation || !activeService) return
    setDraft(createBookmarkFormFromService(editableNavigation, activeService))
    setSlugTouched(true)
    setFeedback(null)
  }, [activeService, editableNavigation, open])

  function handleFieldChange<K extends keyof BookmarkFormValues>(field: K, value: BookmarkFormValues[K]) {
    if (!editableNavigation) return
    setDraft((current) => {
      if (!current) return current
      const next = { ...current, [field]: value }
      if (field === 'name' && !slugTouched && activeService) {
        next.slug = buildSuggestedSlug(String(value), editableNavigation, activeService.slug, current.slug)
      }
      return next
    })
    if (field === 'slug') setSlugTouched(String(value).trim().length > 0)
    setFeedback(null)
  }

  function handleSubmit() {
    if (!navigation || !editableNavigation || !activeService || !draft) return
    try {
      const result = validateBookmarkForm(draft, editableNavigation, { currentSlug: activeService.slug })
      let next = cloneNavigationConfig(navigation)
      const placements = result.placements.map((placement) => ({ ...placement }))
      result.groupsToCreate.forEach(({ sceneId, name }) => {
        const scene = next.scenes.find((item) => item.id === sceneId)!
        const group = createSceneGroup(scene, name)
        scene.groups.push(group)
        placements.find((placement) => placement.sceneId === sceneId)!.groupId = group.id
      })
      const editableSceneIds = new Set(editableNavigation.scenes.map((scene) => scene.id))
      const hiddenPlacements = getBookmarkPlacements(navigation, activeService.slug).filter(
        (placement) => !editableSceneIds.has(placement.sceneId)
      )
      next = upsertBookmark(next, result.bookmark, [...placements, ...hiddenPlacements], activeService.slug)
      saveMutation.mutate(next, {
        onSuccess: () => {
          showToast({ type: 'success', message: messages.bookmarkEdit.saved(result.bookmark.name) })
          onClose()
        },
        onError: (error) => setFeedback({ type: 'error', message: error instanceof Error ? error.message : messages.bookmarkEdit.saveFailed }),
      })
    } catch (error) {
      setFeedback({ type: 'error', message: formatBookmarkError(error) })
    }
  }

  if (!editableNavigation || !activeService || !draft) return null

  return (
    <ModalShell open={open} onClose={onClose} title={messages.bookmarkEdit.title} description={messages.bookmarkEdit.description} icon={Pencil} widthClassName="max-w-3xl">
      <div className="flex min-h-0 flex-1 overflow-hidden md:min-h-[520px]">
        <BookmarkForm config={editableNavigation} values={draft} feedback={feedback} submitLabel={messages.bookmarkEdit.submitButton} submitDisabled={saveMutation.isPending} onSubmit={handleSubmit} onCancel={onClose} onFieldChange={handleFieldChange} />
      </div>
    </ModalShell>
  )
}
