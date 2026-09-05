import { useState } from 'react'
import { useFeedback } from '@/features/feedback/useFeedback'
import { useI18n } from '@/i18n/runtime'

export function DraftNotice({
  changed,
  current,
  latest,
  onReload,
}: {
  changed: boolean
  current: unknown
  latest: unknown
  onReload: () => void
}) {
  const { language } = useI18n()
  const { confirm } = useFeedback()
  const [expanded, setExpanded] = useState(false)
  if (!changed) return null
  const draft =
    typeof current === 'string'
      ? (() => {
          try {
            return JSON.parse(current)
          } catch {
            return 'Invalid JSON draft / JSON 草稿格式不正确'
          }
        })()
      : current
  const zh = language === 'zh-CN'
  return (
    <div role="status" className="border-b border-amber-400/40 bg-amber-400/10 p-3 text-sm">
      <p>
        {zh
          ? '服务器数据已更新，当前输入已保留。请比较后再决定是否重新加载。'
          : 'Server data changed. Your input is preserved. Compare before reloading.'}
      </p>
      <button type="button" className="mr-4 underline" onClick={() => setExpanded(!expanded)}>
        {zh ? '比较版本' : 'Compare versions'}
      </button>
      <button
        type="button"
        className="underline"
        onClick={async () => {
          if (
            await confirm({
              title: zh ? '重新加载' : 'Reload',
              message: zh
                ? '放弃当前未保存输入并加载服务器版本？'
                : 'Discard unsaved input and load the server version?',
            })
          )
            onReload()
        }}
      >
        {zh ? '加载服务器版本' : 'Load server version'}
      </button>
      {expanded && (
        <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-auto text-xs">
          <div>
            <p>{zh ? '当前草稿' : 'Current draft'}</p>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(
                draft,
                (key, value) => (/password|token|_revision/i.test(key) ? undefined : value),
                2
              )}
            </pre>
          </div>
          <div>
            <p>{zh ? '服务器版本' : 'Server version'}</p>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(
                latest,
                (key, value) => (/password|token|_revision/i.test(key) ? undefined : value),
                2
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
