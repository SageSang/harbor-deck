import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconPicker } from '@/components/IconPicker'
import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n/runtime'
import type { NavigationConfig } from '@/config/schema'
import { getFeedbackNoticeClass } from '@/features/feedback/feedbackStyles'
import type { BookmarkFormValues } from '@/features/services/bookmarkForm'

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

interface BookmarkFormProps {
  config: NavigationConfig
  values: BookmarkFormValues
  feedback: FeedbackState | null
  submitLabel: string
  submitDisabled?: boolean
  allowEmptyPlacements?: boolean
  onSubmit: () => void
  onCancel?: () => void
  onFieldChange: <K extends keyof BookmarkFormValues>(
    field: K,
    value: BookmarkFormValues[K]
  ) => void
}

export function BookmarkForm({
  config,
  values,
  feedback,
  submitLabel,
  submitDisabled,
  allowEmptyPlacements = false,
  onSubmit,
  onCancel,
  onFieldChange,
}: BookmarkFormProps) {
  const { messages } = useI18n()
  const fieldCardClass = 'config-panel-card-muted space-y-1.5 p-3'
  const fieldLabelClass =
    'text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/90'

  function updatePlacement(
    index: number,
    next: Partial<BookmarkFormValues['placements'][number]>
  ) {
    onFieldChange(
      'placements',
      values.placements.map((placement, placementIndex) =>
        placementIndex === index ? { ...placement, ...next } : placement
      )
    )
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="config-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-3 pb-5 sm:px-5 sm:py-4 sm:pb-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div className={`${fieldCardClass} md:col-span-2`}>
            <div className="flex items-center justify-between gap-3">
              <span className={`block ${fieldLabelClass}`}>发布位置</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={values.placements.length >= config.scenes.length}
                onClick={() => {
                  const used = new Set(values.placements.map((placement) => placement.sceneId))
                  const scene = config.scenes.find((item) => !used.has(item.id))
                  if (!scene) return
                  onFieldChange('placements', [
                    ...values.placements,
                    {
                      sceneId: scene.id,
                      groupId: scene.groups[0]?.id ?? '',
                      newGroupName: '',
                    },
                  ])
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                添加场景
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {values.placements.map((placement, index) => {
                const scene =
                  config.scenes.find((item) => item.id === placement.sceneId) ?? config.scenes[0]
                const usedByOthers = new Set(
                  values.placements
                    .filter((_, placementIndex) => placementIndex !== index)
                    .map((item) => item.sceneId)
                )
                return (
                  <div
                    key={`${placement.sceneId}-${index}`}
                    className="grid gap-2 rounded-xl border border-border/70 bg-background/65 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <select
                      value={placement.sceneId}
                      onChange={(event) => {
                        const nextScene = config.scenes.find(
                          (item) => item.id === event.target.value
                        )!
                        updatePlacement(index, {
                          sceneId: nextScene.id,
                          groupId: nextScene.groups[0]?.id ?? '',
                          newGroupName: '',
                        })
                      }}
                      className="config-panel-select"
                    >
                      {config.scenes.map((item) => (
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={usedByOthers.has(item.id)}
                        >
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {scene.groups.length > 0 ? (
                      <select
                        value={placement.groupId}
                        onChange={(event) =>
                          updatePlacement(index, { groupId: event.target.value })
                        }
                        className="config-panel-select"
                      >
                        {scene.groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={placement.newGroupName}
                        onChange={(event) =>
                          updatePlacement(index, { newGroupName: event.target.value })
                        }
                        placeholder={messages.common.firstGroupExample}
                        className="h-10"
                      />
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={!allowEmptyPlacements && values.placements.length === 1}
                      aria-label={messages.common.delete}
                      onClick={() =>
                        onFieldChange(
                          'placements',
                          values.placements.filter(
                            (_, placementIndex) => placementIndex !== index
                          )
                        )
                      }
                      className="h-10 w-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              同一个书签可以加入多个场景，并在每个场景选择不同分组。
            </p>
          </div>

          <label className={`${fieldCardClass} md:col-span-2`}>
            <span className={`block ${fieldLabelClass}`}>{messages.bookmarkForm.name}</span>
            <Input
              value={values.name}
              onChange={(event) => onFieldChange('name', event.target.value)}
              placeholder={messages.common.bookmarkNameExample}
              className="h-10"
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {messages.bookmarkForm.nameHint}
            </p>
          </label>

          <label className={`${fieldCardClass} md:col-span-2`}>
            <span className={`block ${fieldLabelClass}`}>{messages.bookmarkForm.note}</span>
            <textarea
              value={values.note ?? ''}
              onChange={(event) => onFieldChange('note', event.target.value)}
              placeholder={messages.bookmarkForm.notePlaceholder}
              rows={4}
              className="config-panel-textarea"
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {messages.bookmarkForm.noteHint}
            </p>
          </label>

          <label className={fieldCardClass}>
            <span className={`block ${fieldLabelClass}`}>{messages.bookmarkForm.slug}</span>
            <Input
              value={values.slug}
              onChange={(event) => onFieldChange('slug', event.target.value)}
              placeholder={messages.common.bookmarkSlugExample}
              className="h-10"
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {messages.bookmarkForm.slugHint}
            </p>
          </label>

          <label className={fieldCardClass}>
            <span className={`block ${fieldLabelClass}`}>{messages.bookmarkForm.icon}</span>
            <IconPicker
              size="sm"
              value={values.icon || undefined}
              onChange={(value) => onFieldChange('icon', value ?? '')}
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {messages.bookmarkForm.iconHint}
            </p>
          </label>

          <label className={fieldCardClass}>
            <span className={`block ${fieldLabelClass}`}>{messages.bookmarkForm.primaryUrl}</span>
            <Input
              value={values.primaryUrl}
              onChange={(event) => onFieldChange('primaryUrl', event.target.value)}
              placeholder="http://192.168.1.100:8080"
              className="h-10"
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {messages.bookmarkForm.primaryUrlHint}
            </p>
          </label>

          <label className={fieldCardClass}>
            <span className={`block ${fieldLabelClass}`}>{messages.bookmarkForm.secondaryUrl}</span>
            <Input
              value={values.secondaryUrl}
              onChange={(event) => onFieldChange('secondaryUrl', event.target.value)}
              placeholder="https://example.com"
              className="h-10"
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {messages.bookmarkForm.secondaryUrlHint}
            </p>
          </label>

          <div className="min-w-0 md:col-span-2">
            <div className="config-panel-card flex flex-col justify-between gap-2.5 p-2.5 sm:flex-row sm:items-center">
              <div>
                <div className="text-[12px] font-medium text-foreground sm:text-[13px]">
                  {messages.bookmarkForm.forceNewTab}
                </div>
                <p className="mt-0.5 text-[11px] leading-[1.2rem] text-muted-foreground sm:text-xs sm:leading-5">
                  {messages.bookmarkForm.forceNewTabHint}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={values.forceNewTab}
                onClick={() => onFieldChange('forceNewTab', !values.forceNewTab)}
                data-checked={values.forceNewTab}
                className="config-switch self-start sm:self-center"
              >
                <span className="config-switch-thumb" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="z-10 flex flex-col gap-2 border-t border-border/65 bg-[linear-gradient(180deg,hsl(var(--background)/0.9),hsl(var(--background)/0.76))] px-3.5 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] backdrop-blur-xl sm:px-5 sm:py-3 sm:pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:flex-row md:items-center md:justify-between md:pb-3">
        <div className={getFeedbackNoticeClass(feedback?.type)}>
          {feedback?.message ?? messages.bookmarkForm.footerHint}
        </div>
        <div className="flex flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="w-full sm:w-auto"
            >
              {messages.common.close}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={submitDisabled} className="w-full sm:w-auto">
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
