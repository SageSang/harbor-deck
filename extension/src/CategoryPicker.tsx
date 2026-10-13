import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { filterCategoryScenes, type SceneOption } from './categoryOptions'

interface Props {
  scenes: SceneOption[]
  selected: Record<string, string>
  isZh: boolean
  onSelect: (sceneId: string, groupId: string) => void
}

export function CategoryPicker({ scenes, selected, isZh, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const searchRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const filtered = useMemo(() => filterCategoryScenes(scenes, query), [scenes, query])
  const searching = query.trim().length > 0
  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    const options = [
      ...(resultsRef.current?.querySelectorAll<HTMLButtonElement>('[data-category-option]') ?? []),
    ]
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = event.key === 'ArrowDown' ? Math.min(index + 1, options.length - 1) : index - 1
      if (next < 0) searchRef.current?.focus()
      else {
        options[next]?.focus()
        options[next]?.scrollIntoView?.({ block: 'nearest' })
      }
    } else if (event.key === 'Enter' && event.target === searchRef.current) {
      event.preventDefault()
      options[0]?.click()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setQuery('')
      searchRef.current?.focus()
    }
  }
  return (
    <div className="category-picker" onKeyDown={handleKeys}>
      <label className="category-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          className="input"
          aria-label={isZh ? '搜索保存位置' : 'Search save locations'}
          placeholder={isZh ? '搜索分类，例如：邮箱、Dewu 测试' : 'Search groups, e.g. Home tools'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            aria-label={isZh ? '清空分类搜索' : 'Clear group search'}
            onClick={() => {
              setQuery('')
              searchRef.current?.focus()
            }}
          >
            <X size={16} />
          </button>
        ) : null}
      </label>
      <div
        className="category-results"
        ref={resultsRef}
        aria-label={isZh ? '保存位置' : 'Save locations'}
      >
        {filtered.map((scene) => (
          <div className="popup-scene" key={scene.id}>
            <button
              type="button"
              className="popup-scene-heading"
              disabled={searching}
              aria-expanded={searching || expanded.has(scene.id)}
              onClick={() =>
                setExpanded((current) => {
                  const next = new Set(current)
                  if (next.has(scene.id)) next.delete(scene.id)
                  else next.add(scene.id)
                  return next
                })
              }
            >
              <strong>
                {scene.name} <span className="category-count">{scene.groups.length}</span>
              </strong>
              {searching || expanded.has(scene.id) ? (
                <ChevronDown aria-hidden="true" />
              ) : (
                <ChevronRight aria-hidden="true" />
              )}
            </button>
            {searching || expanded.has(scene.id) ? (
              <div className="popup-groups">
                {scene.groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    data-category-option="true"
                    aria-pressed={selected[scene.id] === group.id}
                    className={`toggle-option ${selected[scene.id] === group.id ? 'active' : ''}`}
                    onClick={() => onSelect(scene.id, group.id)}
                  >
                    <span className="category-scene-name">{scene.name} / </span>
                    {group.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="hint" role="status">
            {isZh ? '没有匹配的分类，试试其他关键词。' : 'No matching groups. Try another keyword.'}
          </p>
        ) : null}
      </div>
    </div>
  )
}
