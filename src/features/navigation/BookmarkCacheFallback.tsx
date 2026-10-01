import { useEffect } from 'react'
import {
  dismissSearchBootShell,
  getSearchBootState,
  getSearchBootValue,
} from '@/components/searchBoot'
import { BookmarkCacheView } from '@shared/BookmarkCacheView'
import { useAppStore } from '@/store/appStore'
import { clearBookmarkCache } from './bookmarkCache'
import { useBookmarkCache } from './useBookmarkCache'

export function BookmarkCacheFallback({
  busy,
  onRefresh,
}: {
  busy: boolean
  onRefresh: () => void
}) {
  useEffect(() => {
    if (!getSearchBootState()?.released && !useAppStore.getState().searchKeyword) {
      useAppStore.getState().setSearchKeyword(getSearchBootValue())
    }
    dismissSearchBootShell()
  }, [])
  const snapshot = useBookmarkCache()
  const query = useAppStore((state) => state.searchKeyword)
  const setQuery = useAppStore((state) => state.setSearchKeyword)
  const sceneId = useAppStore((state) => state.activeSceneId)
  const setScene = useAppStore((state) => state.initializeActiveScene)
  const language = useAppStore((state) => state.language)
  return snapshot ? (
    <BookmarkCacheView
      snapshot={snapshot}
      busy={busy}
      language={language}
      query={query}
      onQueryChange={setQuery}
      sceneId={sceneId}
      onSceneChange={(id) => setScene(id, false)}
      onRefresh={onRefresh}
      onClear={() => clearBookmarkCache()}
    />
  ) : null
}

export function BookmarkCacheControl() {
  const snapshot = useBookmarkCache()
  const language = useAppStore((state) => state.language)
  if (!snapshot) return null
  return (
    <div className="mx-auto mt-4 text-center text-xs text-muted-foreground">
      <span>{language === 'en' ? 'Local bookmarks saved' : '普通书签已保存在本机'}</span>
      {' · '}
      <button type="button" className="underline" onClick={() => clearBookmarkCache()}>
        {language === 'en' ? 'Clear bookmark cache' : '清除书签缓存'}
      </button>
    </div>
  )
}
