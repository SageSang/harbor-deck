import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { resolveAvailableTarget } from '@extension/network'
import {
  clearPopupDraft,
  readLanguage,
  readPopupDraft,
  readSettings,
  writePopupDraft,
} from '@extension/storage'
import type { ExtensionLanguage, ExtensionSettings, PopupDraft } from '@extension/types'
import './styles.css'

interface SceneGroup {
  id: string
  name: string
}

interface SceneOption {
  id: string
  name: string
  groups: SceneGroup[]
}

interface SceneResponse {
  defaultSceneId: string
  scenes: SceneOption[]
}

interface ExistingBookmarkResponse {
  bookmark: {
    name: string
    primaryUrl: string
    secondaryUrl?: string
    note?: string
  } | null
  placements: Array<{ sceneId: string; groupId: string }>
}

interface PopupState {
  settings: ExtensionSettings | null
  language: ExtensionLanguage
  sourceTabUrl: string
  tabTitle: string
  tabUrl: string
  error: string
  status: string
}

function apiUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString()
}

function apiUrlWithQuery(baseUrl: string, path: string, params: Record<string, string>) {
  const url = new URL(path, baseUrl)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}

export function PopupApp() {
  const [state, setState] = useState<PopupState>({
    settings: null,
    language: 'zh-CN',
    sourceTabUrl: '',
    tabTitle: '',
    tabUrl: '',
    error: '',
    status: '',
  })
  const [scenes, setScenes] = useState<SceneResponse | null>(null)
  const [secondaryUrl, setSecondaryUrl] = useState('')
  const [note, setNote] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [collapsedSceneIds, setCollapsedSceneIds] = useState<Set<string>>(new Set())

  const isZh = state.language === 'zh-CN'
  const selectedCount = Object.keys(selectedGroups).length
  const selectedTargets = useMemo(
    () => Object.entries(selectedGroups).map(([sceneId, groupId]) => ({ sceneId, groupId })),
    [selectedGroups]
  )

  useEffect(() => {
    if (!state.settings || !state.sourceTabUrl) {
      return
    }

    const draft: PopupDraft = {
      sourceTabUrl: state.sourceTabUrl,
      tabUrl: state.tabUrl,
      tabTitle: state.tabTitle,
      secondaryUrl,
      note,
      selectedGroups,
    }
    void writePopupDraft(draft)
  }, [note, secondaryUrl, selectedGroups, state.settings, state.sourceTabUrl, state.tabTitle, state.tabUrl])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [settings, language, tabs, draft] = await Promise.all([
        readSettings(),
        readLanguage(),
        chrome.tabs.query({ active: true, currentWindow: true }),
        readPopupDraft(),
      ])
      const tab = tabs[0]
      const sourceTabUrl = tab?.url ?? ''
      const reusableDraft = draft?.sourceTabUrl === sourceTabUrl ? draft : null
      if (cancelled) return
      setState((current) => ({
        ...current,
        settings,
        language,
        sourceTabUrl,
        tabTitle: reusableDraft?.tabTitle ?? tab?.title ?? '',
        tabUrl: reusableDraft?.tabUrl ?? sourceTabUrl,
      }))
      setSecondaryUrl(reusableDraft?.secondaryUrl ?? '')
      setNote(reusableDraft?.note ?? '')
      setSelectedGroups(reusableDraft?.selectedGroups ?? {})
      if (!settings.apiToken || (!settings.primaryUrl && !settings.fallbackUrl)) {
        await chrome.runtime.openOptionsPage()
        window.close()
        return
      }
      const target = await resolveAvailableTarget(
        settings.primaryUrl,
        settings.fallbackUrl,
        settings.probeTimeoutMs
      )
      if (cancelled || !target.activeUrl) return
      try {
        const response = await fetch(apiUrl(target.activeUrl, '/api/integrations/bookmarks/scenes'), {
          headers: { 'X-HarborDeck-Search-Token': settings.apiToken },
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const result = (await response.json()) as SceneResponse
        if (cancelled) return
        const sortedScenes = [...result.scenes].sort(
          (left, right) => Number(right.id === result.defaultSceneId) - Number(left.id === result.defaultSceneId)
        )
        setScenes({
          ...result,
          scenes: sortedScenes,
        })
        setCollapsedSceneIds(new Set(sortedScenes.map((scene) => scene.id)))

        if (!reusableDraft && /^https?:\/\//i.test(sourceTabUrl)) {
          try {
            const lookupResponse = await fetch(
              apiUrlWithQuery(target.activeUrl, '/api/integrations/bookmarks/lookup', {
                url: sourceTabUrl,
              }),
              {
                headers: { 'X-HarborDeck-Search-Token': settings.apiToken },
                cache: 'no-store',
              }
            )
            if (lookupResponse.ok) {
              const existing = (await lookupResponse.json()) as ExistingBookmarkResponse
              if (!cancelled && existing.bookmark) {
                setState((current) => ({
                  ...current,
                  tabTitle: existing.bookmark!.name,
                  tabUrl: existing.bookmark!.primaryUrl,
                }))
                setSecondaryUrl(existing.bookmark.secondaryUrl ?? '')
                setNote(existing.bookmark.note ?? '')
                setSelectedGroups(
                  Object.fromEntries(
                    existing.placements.map((placement) => [placement.sceneId, placement.groupId])
                  )
                )
              }
            }
          } catch {
            // Lookup is an enhancement; the normal add flow remains available.
          }
        }
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            error: isZh ? '无法读取可用场景，请检查服务地址和 Token。' : 'Unable to load scenes. Check the server URL and token.',
          }))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isZh])

  function toggleGroup(sceneId: string, groupId: string) {
    setSelectedGroups((current) => {
      if (current[sceneId] === groupId) {
        const next = { ...current }
        delete next[sceneId]
        return next
      }
      return { ...current, [sceneId]: groupId }
    })
  }

  function toggleSceneCollapse(sceneId: string) {
    setCollapsedSceneIds((current) => {
      const next = new Set(current)
      if (next.has(sceneId)) {
        next.delete(sceneId)
      } else {
        next.add(sceneId)
      }
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!state.settings || selectedTargets.length === 0 || !state.tabTitle.trim() || !state.tabUrl.trim()) return
    setSaving(true)
    setState((current) => ({ ...current, error: '', status: '' }))
    try {
      const target = await resolveAvailableTarget(
        state.settings.primaryUrl,
        state.settings.fallbackUrl,
        state.settings.probeTimeoutMs
      )
      if (!target.activeUrl) throw new Error('unconfigured')
      const response = await fetch(apiUrl(target.activeUrl, '/api/integrations/bookmarks'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HarborDeck-Search-Token': state.settings.apiToken,
        },
        body: JSON.stringify({
          name: state.tabTitle.trim(),
          primaryUrl: state.tabUrl.trim(),
          secondaryUrl: secondaryUrl.trim() || undefined,
          note: note.trim() || undefined,
          placements: selectedTargets,
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      await clearPopupDraft()
      setState((current) => ({
        ...current,
        status: isZh ? '书签已添加。' : 'Bookmark added.',
      }))
      window.setTimeout(() => window.close(), 450)
    } catch {
      setState((current) => ({
        ...current,
        error: isZh ? '添加失败，请检查地址、Token 和目标场景。' : 'Add failed. Check the URL, token, and target scenes.',
      }))
    } finally {
      setSaving(false)
    }
  }

  if (!state.settings) {
    return <main className="page-shell popup-shell"><section className="panel popup-card"><p>{isZh ? '正在读取当前页面…' : 'Reading current page…'}</p></section></main>
  }

  return (
    <main className="page-shell popup-shell">
      <section className="panel popup-card">
        <div className="eyebrow">HarborDeck</div>
        <h1>{isZh ? '添加到导航' : 'Add to HarborDeck'}</h1>
        <p className="hint">{isZh ? '选择一个或多个场景分组。受保护场景不会出现在这里。' : 'Choose one or more scene groups. Protected scenes are hidden.'}</p>
        <form className="popup-form" onSubmit={handleSubmit}>
          <label className="field"><span>{isZh ? '标题' : 'Title'}</span><input className="input" value={state.tabTitle} onChange={(event) => setState((current) => ({ ...current, tabTitle: event.target.value }))} /></label>
          <label className="field"><span>URL</span><input className="input" value={state.tabUrl} onChange={(event) => setState((current) => ({ ...current, tabUrl: event.target.value }))} /></label>
          <label className="field"><span>{isZh ? '备用 URL（可选）' : 'Secondary URL (optional)'}</span><input className="input" value={secondaryUrl} onChange={(event) => setSecondaryUrl(event.target.value)} /></label>
          <label className="field"><span>{isZh ? '备注（可选）' : 'Note (optional)'}</span><textarea className="input popup-textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <div className="popup-scenes">
            {scenes?.scenes.map((scene) => (
              <div className="popup-scene" key={scene.id}>
                <button
                  type="button"
                  className="popup-scene-heading"
                  aria-expanded={!collapsedSceneIds.has(scene.id)}
                  onClick={() => toggleSceneCollapse(scene.id)}
                >
                  <strong>{scene.name}</strong>
                  {collapsedSceneIds.has(scene.id) ? (
                    <ChevronRight aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </button>
                {!collapsedSceneIds.has(scene.id) ? (
                  <div className="popup-groups">
                    {scene.groups.map((group) => (
                      <button key={group.id} type="button" className={`toggle-option ${selectedGroups[scene.id] === group.id ? 'active' : ''}`} onClick={() => toggleGroup(scene.id, group.id)}>{group.name}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {state.error ? <p className="status-note error">{state.error}</p> : null}
          {state.status ? <p className="status-note success">{state.status}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={saving || selectedCount === 0 || !state.settings.apiToken}>{saving ? (isZh ? '添加中…' : 'Adding…') : (isZh ? '确认添加' : 'Add Bookmark')}</button>
        </form>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<PopupApp />)
