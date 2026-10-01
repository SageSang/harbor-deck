import { useState } from 'react'
import type { BookmarkSnapshot } from './bookmarkSnapshot'
import './bookmarkCache.css'

export function BookmarkCacheView({
  snapshot,
  busy = false,
  language = 'zh-CN',
  onRefresh,
  onClear,
  onInteract,
  query: controlledQuery,
  onQueryChange,
  sceneId: controlledScene,
  onSceneChange,
  children,
}: {
  snapshot: BookmarkSnapshot
  busy?: boolean
  language?: string
  onRefresh: () => void
  onClear: () => void
  onInteract?: () => void
  query?: string
  onQueryChange?: (value: string) => void
  sceneId?: string | null
  onSceneChange?: (value: string) => void
  children?: React.ReactNode
}) {
  const zh = language !== 'en'
  const [ownQuery, setOwnQuery] = useState('')
  const [ownScene, setOwnScene] = useState(snapshot.scenes[0]?.id ?? '')
  const query = controlledQuery ?? ownQuery
  const chosen =
    snapshot.scenes.find((scene) => scene.id === (controlledScene ?? ownScene)) ??
    snapshot.scenes[0]
  const term = query.trim().toLowerCase()
  const groups =
    chosen?.groups
      .map((entry) => ({
        ...entry,
        items: entry.items.filter(
          (item) =>
            !term ||
            [entry.name, item.name, item.primaryUrl, item.secondaryUrl, item.note].some((text) =>
              text?.toLowerCase().includes(term)
            )
        ),
      }))
      .filter((entry) => entry.items.length) ?? []
  return (
    <section
      className="bookmark-cache"
      aria-label={zh ? '本地书签' : 'Local bookmarks'}
      onPointerDown={onInteract}
      onKeyDown={onInteract}
    >
      <header>
        <strong>HARBORDECK</strong>
        <span>{zh ? '本地只读副本' : 'Local read-only copy'}</span>
      </header>
      <p role="status">
        {busy
          ? zh
            ? '正在后台更新…'
            : 'Updating in the background…'
          : zh
            ? '正在显示本地内容'
            : 'Showing local content'}
        {' · '}
        {zh ? '上次更新：' : 'Last updated: '}
        {new Date(snapshot.updatedAt).toLocaleString()}
      </p>
      <input
        aria-label={zh ? '搜索本地书签' : 'Search local bookmarks'}
        placeholder={zh ? '搜索书签' : 'Search bookmarks'}
        value={query}
        onChange={(event) => {
          setOwnQuery(event.target.value)
          onQueryChange?.(event.target.value)
        }}
      />
      <div className="bookmark-cache-actions">
        <button type="button" onClick={onRefresh} disabled={busy}>
          {zh ? '刷新' : 'Refresh'}
        </button>
        <button type="button" onClick={onClear}>
          {zh ? '清除书签缓存' : 'Clear bookmark cache'}
        </button>
        {children}
      </div>
      <nav>
        {snapshot.scenes.map((scene) => (
          <button
            type="button"
            key={scene.id}
            aria-pressed={scene.id === chosen?.id}
            onClick={() => {
              setOwnScene(scene.id)
              onSceneChange?.(scene.id)
            }}
          >
            {scene.name}
          </button>
        ))}
      </nav>
      {!groups.length && (
        <p>{zh ? '没有可显示的普通书签。' : 'No ordinary bookmarks to display.'}</p>
      )}
      {groups.map((entry) => (
        <details key={`${chosen?.id}:${entry.id}`} open>
          <summary>{entry.name}</summary>
          <div className="bookmark-cache-grid">
            {entry.items.map((item) => (
              <article key={item.id}>
                <a href={item.primaryUrl} target="_blank" rel="noreferrer">
                  <span aria-hidden="true">↗</span> {item.name}
                </a>
                {item.note && <p>{item.note}</p>}
                {item.secondaryUrl && (
                  <a
                    className="bookmark-cache-secondary"
                    href={item.secondaryUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {zh ? '备用地址' : 'Secondary address'}
                  </a>
                )}
              </article>
            ))}
          </div>
        </details>
      ))}
    </section>
  )
}
