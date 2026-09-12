import { useI18n } from '@/i18n/runtime'

interface NavigationSyncState {
  syncError: Error | null
  isSyncing: boolean
  retrySync: () => Promise<void>
}

/** A committed write must never be presented as a failed write or retried as one. */
export function NavigationSyncNotice({ save }: { save: NavigationSyncState }) {
  const { language } = useI18n()
  if (!save.syncError) return null
  const zh = language === 'zh-CN'
  return (
    <div role="status" className="border-b border-amber-400/40 bg-amber-400/10 p-3 text-sm">
      <p>
        {zh
          ? '已保存，但页面同步失败。请重新读取，勿重复提交。'
          : 'Saved, but the page could not refresh. Reload without submitting again.'}
      </p>
      <button
        type="button"
        disabled={save.isSyncing}
        className="mt-2 underline"
        onClick={() => void save.retrySync()}
      >
        {save.isSyncing
          ? zh
            ? '正在重新读取…'
            : 'Reloading…'
          : zh
            ? '仅重新读取'
            : 'Reload saved data'}
      </button>
    </div>
  )
}
