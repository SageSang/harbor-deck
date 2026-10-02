import { useAppStore } from '@/store/appStore'
import { clearBookmarkCache, BOOKMARK_CACHE_REFRESH } from './bookmarkCache'
import { useBookmarkCache } from './useBookmarkCache'
import { useNavigationConfig } from './useNavigation'

export function BookmarkCacheControl() {
  const snapshot = useBookmarkCache()
  const navigation = useNavigationConfig()
  const language = useAppStore((state) => state.language)
  if (!snapshot) return null
  return (
    <div className="mx-auto mt-4 text-center text-xs text-muted-foreground">
      <span>
        {navigation.canEdit
          ? language === 'en'
            ? 'Local bookmark copy'
            : '本机书签副本'
          : language === 'en'
            ? 'Local copy · connect to edit'
            : '正在显示本机内容 · 连接后可编辑'}
      </span>
      {' · '}
      <button
        type="button"
        className="underline"
        onClick={() => window.dispatchEvent(new Event(BOOKMARK_CACHE_REFRESH))}
      >
        {language === 'en' ? 'Refresh' : '重新检测'}
      </button>
      {' · '}
      <button type="button" className="underline" onClick={() => clearBookmarkCache()}>
        {language === 'en' ? 'Clear bookmark cache' : '清除书签缓存'}
      </button>
    </div>
  )
}
