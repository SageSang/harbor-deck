import { useEffect, useMemo, useState } from 'react'
import { Copy, Pencil, Plus } from 'lucide-react'
import { ModalShell } from '@/components/ModalShell'
import type { NavigationConfig } from '@/config/schema'
import { useFeedback } from '@/features/feedback/useFeedback'
import { BookmarkForm } from '@/features/services/BookmarkFormPanel'
import { useI18n } from '@/i18n/runtime'
import {
  buildSuggestedSlug,
  createEmptyBookmarkForm,
  createBookmarkFormFromService,
  createDuplicateBookmarkForm,
  formatBookmarkError,
  type BookmarkFormValues,
  validateBookmarkForm,
} from '@/features/services/bookmarkForm'
import {
  cloneNavigationConfig,
  createSceneGroup,
  getBookmarkPlacements,
  upsertBookmark,
} from '@/features/navigation/navigationConfig'
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
  mode?: 'edit' | 'duplicate' | 'create'
  initialSceneId?: string | null
  initialGroupId?: string | null
  onClose: () => void
}

export function BookmarkEditDialog({
  open,
  config,
  serviceSlug,
  mode = 'edit',
  initialSceneId,
  initialGroupId,
  onClose,
}: BookmarkEditDialogProps) {
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
    if (!open || !editableNavigation) return
    if (mode === 'create') {
      setDraft(
        createEmptyBookmarkForm(editableNavigation, initialSceneId, initialGroupId, { blank: true })
      )
      setSlugTouched(false)
    } else if (activeService) {
      setDraft(
        mode === 'duplicate'
          ? createDuplicateBookmarkForm(editableNavigation, activeService)
          : createBookmarkFormFromService(editableNavigation, activeService)
      )
      setSlugTouched(mode === 'edit')
    }
    setFeedback(null)
  }, [activeService, editableNavigation, initialGroupId, initialSceneId, mode, open])

  function handleFieldChange<K extends keyof BookmarkFormValues>(
    field: K,
    value: BookmarkFormValues[K]
  ) {
    if (!editableNavigation) return
    setDraft((current) => {
      if (!current) return current
      const next = { ...current, [field]: value }
      if (field === 'name' && !slugTouched) {
        next.slug = buildSuggestedSlug(
          String(value),
          editableNavigation,
          mode === 'edit' ? activeService?.slug : undefined,
          current.slug
        )
      }
      return next
    })
    if (field === 'slug') setSlugTouched(String(value).trim().length > 0)
    setFeedback(null)
  }

  function handleSubmit() {
    if (!navigation || !editableNavigation || !draft) return
    if (mode !== 'create' && !activeService) return
    try {
      const result = validateBookmarkForm(
        draft,
        editableNavigation,
        mode === 'edit' && activeService ? { currentSlug: activeService.slug } : undefined
      )
      let next = cloneNavigationConfig(navigation)
      const placements = result.placements.map((placement) => ({ ...placement }))
      result.groupsToCreate.forEach(({ sceneId, name }) => {
        const scene = next.scenes.find((item) => item.id === sceneId)!
        const group = createSceneGroup(scene, name)
        scene.groups.push(group)
        placements.find((placement) => placement.sceneId === sceneId)!.groupId = group.id
      })
      const hiddenPlacements =
        mode === 'edit' && activeService
          ? getBookmarkPlacements(navigation, activeService.slug).filter(
              (placement) =>
                !editableNavigation.scenes.some((scene) => scene.id === placement.sceneId)
            )
          : []
      next = upsertBookmark(
        next,
        result.bookmark,
        [...placements, ...hiddenPlacements],
        mode === 'edit' && activeService ? activeService.slug : undefined,
        mode === 'edit'
          ? { preserveExistingPlacement: true }
          : mode === 'duplicate'
            ? { insertAfterBookmarkId: activeService?.slug }
            : undefined
      )
      saveMutation.mutate(next, {
        onSuccess: () => {
          showToast({
            type: 'success',
            message:
              mode === 'duplicate'
                ? messages.bookmarkEdit.duplicated(result.bookmark.name)
                : mode === 'create'
                  ? messages.bookmarkEdit.created(result.bookmark.name)
                  : messages.bookmarkEdit.saved(result.bookmark.name),
          })
          onClose()
        },
        onError: (error) =>
          setFeedback({
            type: 'error',
            message: error instanceof Error ? error.message : messages.bookmarkEdit.saveFailed,
          }),
      })
    } catch (error) {
      setFeedback({ type: 'error', message: formatBookmarkError(error) })
    }
  }

  if (!editableNavigation || (mode !== 'create' && !activeService) || !draft) return null

  const isDuplicate = mode === 'duplicate'
  const isCreate = mode === 'create'

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={
        isCreate
          ? messages.bookmarkEdit.createTitle
          : isDuplicate
            ? messages.bookmarkEdit.duplicateTitle
            : messages.bookmarkEdit.title
      }
      description={
        isCreate
          ? messages.bookmarkEdit.createDescription
          : isDuplicate
            ? messages.bookmarkEdit.duplicateDescription
            : messages.bookmarkEdit.description
      }
      icon={isCreate ? Plus : isDuplicate ? Copy : Pencil}
      widthClassName="max-w-3xl"
    >
      <div className="flex min-h-0 flex-1 overflow-hidden md:min-h-[520px]">
        <BookmarkForm
          config={editableNavigation}
          values={draft}
          feedback={feedback}
          submitLabel={
            isCreate
              ? messages.bookmarkEdit.createSubmitButton
              : isDuplicate
                ? messages.bookmarkEdit.duplicateSubmitButton
                : messages.bookmarkEdit.submitButton
          }
          submitDisabled={saveMutation.isPending}
          onSubmit={handleSubmit}
          onCancel={onClose}
          onFieldChange={handleFieldChange}
        />
      </div>
    </ModalShell>
  )
}
