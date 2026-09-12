import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { requestResolution } from './resolutionClient'
import { getInstanceKey, sameSettings } from './resolutionState'
import {
  getIntegrationJson,
  integrationRequest,
  lookupPath,
  matchesSubmission,
  IntegrationHttpError,
  IntegrationNetworkError,
  IntegrationSettingsError,
  type ExistingBookmarkResponse,
} from './integrationClient'
import {
  clearPopupDraft,
  readLanguage,
  readPopupDraft,
  readSettings,
  writePopupDraft,
} from './storage'
import { restoreExtensionTheme } from './theme'
import type { ExtensionLanguage, ExtensionSettings, PopupDraft, BookmarkSubmission } from './types'
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

interface PopupState {
  settings: ExtensionSettings | null
  language: ExtensionLanguage
  sourceTabUrl: string
  tabTitle: string
  tabUrl: string
  error: string
  status: string
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
  const [recordSceneId, setRecordSceneId] = useState('')
  const [existingBookmarkSlug, setExistingBookmarkSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [collapsedSceneIds, setCollapsedSceneIds] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [pendingSubmission, setPendingSubmission] = useState<BookmarkSubmission | undefined>()
  const dirty = useRef(false)
  const userEdited = useRef(false)
  const saved = useRef(false)
  const mounted = useRef(true)
  const markDirty = () => {
    dirty.current = true
    userEdited.current = true
  }

  const errorText = (error: unknown, language = state.language) => {
    const zh = language === 'zh-CN'
    if (error instanceof IntegrationHttpError)
      return error.status === 401 || error.status === 403
        ? zh
          ? '接口认证或权限不足，请检查 Token 和地址授权。'
          : 'Authentication or permission failed. Check the token and site permissions.'
        : zh
          ? `服务器返回 HTTP ${error.status}，请核对内容。`
          : `Server returned HTTP ${error.status}. Check the submitted content.`
    if (error instanceof IntegrationSettingsError)
      return zh
        ? '服务设置已变化，请关闭并重新打开弹窗。'
        : 'Server settings changed. Close and reopen the popup.'
    return zh
      ? '无法完成请求，请检查网络和服务地址。'
      : 'The request could not complete. Check the network and server addresses.'
  }

  const isZh = state.language === 'zh-CN'
  const selectedCount = Object.keys(selectedGroups).length
  const selectedTargets = useMemo(
    () => Object.entries(selectedGroups).map(([sceneId, groupId]) => ({ sceneId, groupId })),
    [selectedGroups]
  )

  function makeDraft(submission = pendingSubmission): PopupDraft {
    return {
      sourceTabUrl: state.sourceTabUrl,
      tabUrl: state.tabUrl,
      tabTitle: state.tabTitle,
      secondaryUrl,
      note,
      selectedGroups,
      recordSceneId,
      existingBookmarkSlug,
      instanceKey: state.settings ? getInstanceKey(state.settings) : undefined,
      ...(submission ? { pendingSubmission: submission } : {}),
    }
  }

  useEffect(() => {
    if (
      (!ready && !userEdited.current) ||
      !dirty.current ||
      saved.current ||
      !state.settings ||
      !state.sourceTabUrl
    )
      return
    void writePopupDraft({
      sourceTabUrl: state.sourceTabUrl,
      tabUrl: state.tabUrl,
      tabTitle: state.tabTitle,
      secondaryUrl,
      note,
      selectedGroups,
      recordSceneId,
      existingBookmarkSlug,
      instanceKey: getInstanceKey(state.settings),
      ...(pendingSubmission ? { pendingSubmission } : {}),
    }).catch(() => undefined)
  }, [
    ready,
    pendingSubmission,
    existingBookmarkSlug,
    note,
    recordSceneId,
    secondaryUrl,
    selectedGroups,
    state.settings,
    state.sourceTabUrl,
    state.tabTitle,
    state.tabUrl,
  ])

  useEffect(() => {
    let cancelled = false
    mounted.current = true
    async function load() {
      const [settings, language, tabs] = await Promise.all([
        readSettings(),
        readLanguage(),
        chrome.tabs.query({ active: true, currentWindow: true }),
      ])
      void restoreExtensionTheme().catch(() => undefined)
      const tab = tabs[0]
      const sourceTabUrl = tab?.url ?? ''
      const instanceKey = getInstanceKey(settings)
      const draft = await readPopupDraft(instanceKey, sourceTabUrl)
      const reusableDraft = draft?.sourceTabUrl === sourceTabUrl ? draft : null
      if (cancelled) return
      setState((current) => ({
        ...current,
        settings,
        language,
        sourceTabUrl,
        tabTitle: reusableDraft?.tabTitle ?? tab?.title ?? '',
        tabUrl: reusableDraft?.tabUrl ?? sourceTabUrl,
        status:
          reusableDraft && !reusableDraft.instanceKey
            ? language === 'zh-CN'
              ? '已恢复旧草稿内容，请重新核对并选择分组。'
              : 'Legacy draft text restored. Check and select its groups again.'
            : '',
      }))
      setSecondaryUrl(reusableDraft?.secondaryUrl ?? '')
      setNote(reusableDraft?.note ?? '')
      // A legacy draft has no reliable server identity. Preserve its text and stored
      // original, but never silently send old group IDs to another instance.
      if (reusableDraft?.instanceKey === instanceKey) {
        setSelectedGroups(reusableDraft.selectedGroups)
        setRecordSceneId(reusableDraft.recordSceneId ?? '')
        setExistingBookmarkSlug(reusableDraft.existingBookmarkSlug ?? '')
        setPendingSubmission(reusableDraft.pendingSubmission)
      }
      dirty.current = Boolean(reusableDraft)
      if (!settings.apiToken || (!settings.primaryUrl && !settings.fallbackUrl)) {
        await chrome.runtime.openOptionsPage()
        window.close()
        return
      }
      try {
        const target = await requestResolution(settings)
        if (cancelled) return
        const result = await getIntegrationJson<SceneResponse>(
          settings,
          '/api/integrations/bookmarks/scenes',
          target.activeUrl
        )
        if (cancelled) return
        const sortedScenes = [...result.scenes].sort(
          (left, right) =>
            Number(right.id === result.defaultSceneId) - Number(left.id === result.defaultSceneId)
        )
        setScenes({ ...result, scenes: sortedScenes })
        setCollapsedSceneIds(new Set(sortedScenes.map((scene) => scene.id)))
        setRecordSceneId((current) =>
          result.scenes.some((scene) => scene.id === current) ? current : result.defaultSceneId
        )
        if (!reusableDraft && /^https?:\/\//i.test(sourceTabUrl)) {
          try {
            const existing = await getIntegrationJson<ExistingBookmarkResponse>(
              settings,
              lookupPath(sourceTabUrl)
            )
            if (!cancelled && !dirty.current && existing.bookmark) {
              setState((current) => ({
                ...current,
                tabTitle: existing.bookmark!.name,
                tabUrl: existing.bookmark!.primaryUrl,
              }))
              setSecondaryUrl(existing.bookmark.secondaryUrl ?? '')
              setNote(existing.bookmark.note ?? '')
              setExistingBookmarkSlug(existing.bookmark.slug)
              setSelectedGroups(
                Object.fromEntries(
                  existing.placements.map((placement) => [placement.sceneId, placement.groupId])
                )
              )
              setRecordSceneId(existing.placements[0]?.sceneId ?? result.defaultSceneId)
            } else if (!cancelled && !dirty.current && existing.quickRecord) {
              setState((current) => ({
                ...current,
                tabTitle: existing.quickRecord!.name,
                tabUrl: existing.quickRecord!.primaryUrl,
              }))
              setSecondaryUrl(existing.quickRecord.secondaryUrl ?? '')
              setNote(existing.quickRecord.note ?? '')
              setRecordSceneId(existing.quickRecord.sceneId)
            }
          } catch (error) {
            if (!cancelled)
              setState((current) => ({ ...current, error: errorText(error, language) }))
          }
        }
      } catch (error) {
        if (!cancelled) setState((current) => ({ ...current, error: errorText(error, language) }))
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void load().catch((error: unknown) => {
      if (!cancelled) {
        setState((current) => ({ ...current, error: errorText(error) }))
        setReady(true)
      }
    })
    return () => {
      cancelled = true
      mounted.current = false
    }
    // Initialization owns its captured language; changing the loaded language
    // must not restart it and turn initial values into a reusable draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleGroup(sceneId: string, groupId: string) {
    markDirty()
    setRecordSceneId(sceneId)
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
    markDirty()
    setRecordSceneId(sceneId)
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

  async function checkSubmission(body: BookmarkSubmission) {
    if (!state.settings) return
    try {
      const existing = await getIntegrationJson<ExistingBookmarkResponse>(
        state.settings,
        lookupPath(body.primaryUrl)
      )
      if (!mounted.current) return
      setState((current) => ({
        ...current,
        error: isZh
          ? '保存结果仍需核验，草稿已保留。不会自动重复提交。'
          : 'The save result needs verification. Your draft is kept and will not be resubmitted automatically.',
        status: matchesSubmission(existing, body)
          ? isZh
            ? '服务器存在与提交内容匹配的记录；这不能证明本次请求已完成。'
            : 'The server has matching content; this does not prove this request completed.'
          : isZh
            ? '未能唯一核对提交结果，请在导航页检查后决定是否再次保存。'
            : 'The result could not be uniquely verified. Check HarborDeck before saving again.',
      }))
    } catch {
      if (mounted.current)
        setState((current) => ({
          ...current,
          error: isZh
            ? '保存结果未确认，且暂时无法读取服务器。草稿已保留，请稍后核验。'
            : 'The save is unconfirmed and the server could not be read. Your draft is kept for later verification.',
        }))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      saving ||
      saved.current ||
      !ready ||
      !state.settings ||
      !recordSceneId ||
      !state.tabTitle.trim() ||
      !state.tabUrl.trim()
    )
      return
    setSaving(true)
    setState((current) => ({ ...current, error: '', status: '' }))
    const body: BookmarkSubmission = {
      name: state.tabTitle.trim(),
      primaryUrl: state.tabUrl.trim(),
      secondaryUrl: secondaryUrl.trim() || undefined,
      note: note.trim() || undefined,
      placements: selectedTargets,
      ...(existingBookmarkSlug && selectedTargets.length > 0 ? { existingBookmarkSlug } : {}),
      ...(selectedTargets.length === 0 ? { recordSceneId } : {}),
    }
    let dispatched = false
    let confirmed = false
    try {
      if (!sameSettings(state.settings, await readSettings())) throw new IntegrationSettingsError()
      const target = await requestResolution(state.settings)
      if (!target.activeUrl) throw new Error('No available address')
      dirty.current = true
      setPendingSubmission(body)
      await writePopupDraft(makeDraft(body))
      dispatched = true
      await integrationRequest(target.activeUrl, '/api/integrations/bookmarks', state.settings, {
        body,
      })
      confirmed = true
      saved.current = true
      await clearPopupDraft(getInstanceKey(state.settings), state.sourceTabUrl)
      if (!mounted.current) return
      setPendingSubmission(undefined)
      setState((current) => ({ ...current, status: isZh ? '已保存。' : 'Saved.' }))
      window.setTimeout(() => window.close(), 450)
    } catch (error) {
      if (confirmed && mounted.current) {
        setPendingSubmission(undefined)
        setState((current) => ({
          ...current,
          status: isZh
            ? '已保存，但旧草稿暂未清理，请关闭弹窗。'
            : 'Saved, but the old draft could not be cleared. Close the popup.',
        }))
      } else if (dispatched && error instanceof IntegrationNetworkError) await checkSubmission(body)
      else if (mounted.current) {
        setPendingSubmission(undefined)
        setState((current) => ({ ...current, error: errorText(error) }))
      }
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  if (!state.settings) {
    return (
      <main className="page-shell popup-shell">
        <section className="panel popup-card">
          <p>{state.error || (isZh ? '正在读取当前页面…' : 'Reading current page…')}</p>
          {state.error ? (
            <button onClick={() => void chrome.runtime.openOptionsPage()}>
              {isZh ? '打开设置' : 'Open settings'}
            </button>
          ) : null}
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell popup-shell">
      <section className="panel popup-card">
        <div className="eyebrow">HarborDeck</div>
        <h1>{isZh ? '添加到导航' : 'Add to HarborDeck'}</h1>
        <p className="hint">
          {isZh
            ? '选择一个或多个场景分组。受保护场景不会出现在这里。'
            : 'Choose one or more scene groups. Protected scenes are hidden.'}
        </p>
        <form className="popup-form" onSubmit={handleSubmit}>
          <fieldset disabled={saving || saved.current} style={{ display: 'contents' }}>
            <label className="field">
              <span>{isZh ? '标题' : 'Title'}</span>
              <input
                className="input"
                value={state.tabTitle}
                onChange={(event) => {
                  markDirty()
                  setState((current) => ({ ...current, tabTitle: event.target.value }))
                }}
              />
            </label>
            <label className="field">
              <span>URL</span>
              <input
                className="input"
                value={state.tabUrl}
                onChange={(event) => {
                  markDirty()
                  setState((current) => ({ ...current, tabUrl: event.target.value }))
                }}
              />
            </label>
            <label className="field">
              <span>{isZh ? '备用 URL（可选）' : 'Secondary URL (optional)'}</span>
              <input
                className="input"
                value={secondaryUrl}
                onChange={(event) => {
                  markDirty()
                  setSecondaryUrl(event.target.value)
                }}
              />
            </label>
            <label className="field">
              <span>{isZh ? '备注（可选）' : 'Note (optional)'}</span>
              <textarea
                className="input popup-textarea"
                rows={3}
                value={note}
                onChange={(event) => {
                  markDirty()
                  setNote(event.target.value)
                }}
              />
            </label>
            <div className="popup-scenes">
              {scenes?.scenes.map((scene) => (
                <div className="popup-scene" key={scene.id}>
                  <button
                    type="button"
                    className="popup-scene-heading"
                    aria-expanded={!collapsedSceneIds.has(scene.id)}
                    onClick={() => toggleSceneCollapse(scene.id)}
                  >
                    <strong>
                      {scene.name}
                      {recordSceneId === scene.id && selectedCount === 0 ? ' · 快速记录' : ''}
                    </strong>
                    {collapsedSceneIds.has(scene.id) ? (
                      <ChevronRight aria-hidden="true" />
                    ) : (
                      <ChevronDown aria-hidden="true" />
                    )}
                  </button>
                  {!collapsedSceneIds.has(scene.id) ? (
                    <div className="popup-groups">
                      {scene.groups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          className={`toggle-option ${selectedGroups[scene.id] === group.id ? 'active' : ''}`}
                          onClick={() => toggleGroup(scene.id, group.id)}
                        >
                          {group.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {pendingSubmission ? (
              <div className="status-note">
                <p>
                  {isZh
                    ? '存在尚未确认的提交，草稿已保留。'
                    : 'A submission is unconfirmed. Your draft is kept.'}
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={() => void checkSubmission(pendingSubmission)}
                >
                  {isZh ? '只读核对保存结果' : 'Check save result'}
                </button>
              </div>
            ) : null}
            {state.error ? <p className="status-note error">{state.error}</p> : null}
            {state.status ? <p className="status-note success">{state.status}</p> : null}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={
                !ready || saving || saved.current || !recordSceneId || !state.settings.apiToken
              }
            >
              {saving
                ? isZh
                  ? '保存中…'
                  : 'Saving…'
                : selectedCount === 0
                  ? isZh
                    ? '保存记录'
                    : 'Save record'
                  : existingBookmarkSlug
                    ? isZh
                      ? '保存修改'
                      : 'Save Changes'
                    : isZh
                      ? '确认添加'
                      : 'Add Bookmark'}
            </button>
          </fieldset>
        </form>
      </section>
    </main>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) createRoot(rootElement).render(<PopupApp />)
