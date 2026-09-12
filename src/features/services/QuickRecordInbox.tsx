import { lazy, Suspense, useState } from 'react'
import { Inbox } from 'lucide-react'
import { ModalShell } from '@/components/ModalShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNavigationConfig, useSaveNavigationConfig } from '@/features/navigation/useNavigation'
import { useAppStore } from '@/store/appStore'
import { useI18n } from '@/i18n/runtime'
import { useFeedback } from '@/features/feedback/useFeedback'
import { quickRecordMatchesSearch } from './quickRecordSearch'
import { NavigationSyncNotice } from '@/features/navigation/NavigationSyncNotice'
const QuickRecordEditDialog = lazy(() =>
  import('./QuickRecordEditDialog').then((module) => ({ default: module.QuickRecordEditDialog }))
)

export function QuickRecordInbox() {
  const sceneId = useAppStore((state) => state.activeSceneId)
  const accessVersion = useAppStore((state) => state.sceneAccessVersion)
  return <InboxContent key={`${sceneId}:${accessVersion}`} sceneId={sceneId} />
}

function InboxContent({ sceneId }: { sceneId: string | null }) {
  const { data: navigation } = useNavigationConfig()
  const { showToast } = useFeedback()
  const { language, messages } = useI18n()
  const zh = language === 'zh-CN'
  const title = zh ? '快速记录' : 'Quick records'
  const [open, setOpen] = useState(false)
  const save = useSaveNavigationConfig(`${sceneId}:${open}`)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [groupId, setGroupId] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const scene = navigation?.scenes.find((item) => item.id === sceneId)
  const records = scene?.quickRecords ?? []
  const filtered = query.trim()
    ? records.filter((record) => quickRecordMatchesSearch(record, query))
    : records
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-10 rounded-full px-2"
        aria-label={`${title} (${records.length})`}
        onClick={() => setOpen(true)}
      >
        <Inbox className="h-4 w-4" />
        <span className="hidden lg:inline">{title}</span>
        <span>{records.length}</span>
      </Button>
      <ModalShell
        open={open}
        onClose={() => {
          if (!save.isPending) setOpen(false)
        }}
        title={`${title} · ${scene?.name ?? ''}`}
        icon={Inbox}
        widthClassName="max-w-3xl"
      >
        <NavigationSyncNotice save={save} />
        <div className="min-h-0 overflow-auto p-4">
          <Input
            value={query}
            placeholder={messages.common.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="my-3 flex flex-wrap gap-2">
            <select
              disabled={save.isSaveBlocked}
              aria-label={zh ? '目标分组' : 'Target group'}
              className="config-panel-select"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">{zh ? '选择目标分组' : 'Choose a group'}</option>
              {scene?.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <Button
              disabled={!selected.length || !groupId || save.isSaveBlocked}
              onClick={async () => {
                if (!navigation || !sceneId) return
                try {
                  const { promoteQuickRecords } = await import('./promoteQuickRecords')
                  save.mutate(promoteQuickRecords(navigation, sceneId, selected, groupId), {
                    onSuccess: () => {
                      setSelected([])
                      showToast({ type: 'success', message: zh ? '已归入分组' : 'Moved to group' })
                    },
                    onError: (error) => showToast({ type: 'error', message: error.message }),
                  })
                } catch (error) {
                  showToast({
                    type: 'error',
                    message: error instanceof Error ? error.message : messages.common.requestFailed,
                  })
                }
              }}
            >
              {zh ? '批量归组' : 'Move selected'} ({selected.length})
            </Button>
          </div>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">{messages.common.noServices}</p>
          )}
          {filtered.map((record) => (
            <div key={record.id} className="flex items-center gap-3 border-b border-border py-3">
              <input
                type="checkbox"
                aria-label={record.name}
                checked={selected.includes(record.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, record.id]
                      : selected.filter((id) => id !== record.id)
                  )
                }
              />
              <div className="min-w-0 flex-1">
                <a
                  className="block truncate font-medium underline"
                  href={record.primaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {record.name}
                </a>
                <p className="truncate text-xs text-muted-foreground">{record.primaryUrl}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(record.id)}>
                {messages.serviceGrid.editAction}
              </Button>
            </div>
          ))}
        </div>
      </ModalShell>
      {editing && (
        <Suspense fallback={null}>
          <QuickRecordEditDialog
            open={Boolean(editing)}
            sceneId={sceneId}
            recordId={editing}
            onClose={() => setEditing(null)}
          />
        </Suspense>
      )}
    </>
  )
}
