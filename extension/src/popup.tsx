import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { X } from 'lucide-react'
import { CategoryPicker } from './CategoryPicker'
import { invalidCategoryTargets, type SceneOption } from './categoryOptions'
import { getInstanceKey, sameSettings } from './resolutionState'
import {
  getIntegrationJson,
  integrationRequest,
  integrationTarget,
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
  const [moreOpen, setMoreOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [submissionReviewed, setSubmissionReviewed] = useState(false)
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

  const invalidTargets = scenes ? invalidCategoryTargets(scenes.scenes, selectedGroups) : []
  const invalidRecordTarget = Boolean(
    scenes && recordSceneId && !scenes.scenes.some((scene) => scene.id === recordSceneId)
  )
  const targetInvalid = invalidTargets.length > 0 || (selectedCount === 0 && invalidRecordTarget)
  const recordSceneName = scenes?.scenes.find((scene) => scene.id === recordSceneId)?.name ?? ''
  useEffect(() => {
    if (note || secondaryUrl) setMoreOpen(true)
  }, [note, secondaryUrl])

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
      if (!/^https?:\/\//i.test(sourceTabUrl) && !reusableDraft) {
        setState((current) => ({
          ...current,
          tabUrl: '',
          tabTitle: '',
          error:
            language === 'zh-CN'
              ? '此页面不能收藏，请在 HTTP 或 HTTPS 网页上使用扩展。'
              : 'This page cannot be saved. Open the extension on an HTTP or HTTPS page.',
        }))
        setReady(true)
        return
      }
      if (!settings.apiToken || (!settings.primaryUrl && !settings.fallbackUrl)) {
        await chrome.runtime.openOptionsPage()
        window.close()
        return
      }
      try {
        if (cancelled) return
        const result = await getIntegrationJson<SceneResponse>(
          settings,
          '/api/integrations/bookmarks/scenes'
        )
        if (cancelled) return
        const sortedScenes = [...result.scenes].sort(
          (left, right) =>
            Number(right.id === result.defaultSceneId) - Number(left.id === result.defaultSceneId)
        )
        setScenes({ ...result, scenes: sortedScenes })
        setRecordSceneId((current) => current || result.defaultSceneId)
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
    setSelectedGroups((current) => {
      if (current[sceneId] === groupId) {
        const next = { ...current }
        delete next[sceneId]
        return next
      }
      return { ...current, [sceneId]: groupId }
    })
  }

  function removeSelection(sceneId: string) {
    markDirty()
    setSelectedGroups((current) => {
      const next = { ...current }
      delete next[sceneId]
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
      setSubmissionReviewed(true)
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
      pendingSubmission ||
      targetInvalid ||
      saved.current ||
      !ready ||
      !scenes ||
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
      const target = integrationTarget(state.settings)
      if (!target) throw new Error('No available address')
      dirty.current = true
      setSubmissionReviewed(false)
      setPendingSubmission(body)
      await writePopupDraft(makeDraft(body))
      dispatched = true
      await integrationRequest(target, '/api/integrations/bookmarks', state.settings, {
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
        <form
          className="popup-form"
          onSubmit={handleSubmit}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              event.target instanceof HTMLInputElement &&
              !event.nativeEvent.isComposing
            )
              event.preventDefault()
          }}
        >
          <fieldset disabled={saving || saved.current} style={{ display: 'contents' }}>
            <div className="popup-fields">
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
              <details
                className="popup-more"
                open={moreOpen}
                onToggle={(event) => setMoreOpen(event.currentTarget.open)}
              >
                <summary>
                  {isZh ? '更多信息（备用地址、备注）' : 'More details (secondary URL, note)'}
                </summary>
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
              </details>
            </div>
            <CategoryPicker
              scenes={scenes?.scenes ?? []}
              selected={selectedGroups}
              isZh={isZh}
              onSelect={toggleGroup}
            />
            <div className="popup-footer">
              <div className="popup-save-context">
                {selectedCount > 0 ? (
                  <div
                    className="selected-locations"
                    aria-label={isZh ? '已选位置' : 'Selected locations'}
                  >
                    {selectedTargets.map(({ sceneId, groupId }) => {
                      const scene = scenes?.scenes.find((item) => item.id === sceneId)
                      const group = scene?.groups.find((item) => item.id === groupId)
                      const label = `${scene?.name ?? sceneId} / ${group?.name ?? (isZh ? '原分类已调整' : 'Group no longer available')}`
                      return (
                        <button
                          type="button"
                          className={`selected-location ${group ? '' : 'invalid'}`}
                          key={sceneId}
                          aria-label={`${isZh ? '移除' : 'Remove'} ${label}`}
                          onClick={() => removeSelection(sceneId)}
                        >
                          {label}
                          <X size={13} aria-hidden="true" />
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <label className="quick-record-target">
                    <span>{isZh ? '保存为快速记录' : 'Save as a quick record'}</span>
                    <select
                      aria-label={isZh ? '快速记录目标场景' : 'Quick record scene'}
                      value={invalidRecordTarget ? '' : recordSceneId}
                      onChange={(event) => {
                        markDirty()
                        setRecordSceneId(event.target.value)
                      }}
                    >
                      {invalidRecordTarget ? (
                        <option value="" disabled>
                          {isZh ? '请选择场景' : 'Choose a scene'}
                        </option>
                      ) : null}
                      {scenes?.scenes.map((scene) => (
                        <option key={scene.id} value={scene.id}>
                          {scene.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {targetInvalid ? (
                  <p className="status-note error" role="alert">
                    {isZh
                      ? '原分类或场景已调整，请重新选择保存位置。'
                      : 'A saved group or scene has changed. Please choose a save location again.'}
                  </p>
                ) : null}
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
                    {submissionReviewed ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          markDirty()
                          setPendingSubmission(undefined)
                          setSubmissionReviewed(false)
                          setState((current) => ({
                            ...current,
                            error: '',
                            status: isZh
                              ? '已恢复编辑，请核对内容后再保存。'
                              : 'Editing resumed. Review the content before saving.',
                          }))
                        }}
                      >
                        {isZh ? '已核对，继续编辑' : 'Reviewed, resume editing'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {state.error ? <p className="status-note error">{state.error}</p> : null}
                {state.status ? <p className="status-note success">{state.status}</p> : null}
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={
                  !ready ||
                  !scenes ||
                  saving ||
                  Boolean(pendingSubmission) ||
                  targetInvalid ||
                  saved.current ||
                  !recordSceneId ||
                  !state.settings.apiToken
                }
              >
                {saving
                  ? isZh
                    ? '保存中…'
                    : 'Saving…'
                  : selectedCount === 0
                    ? isZh
                      ? `保存到 ${recordSceneName} 快速记录`
                      : `Save record to ${recordSceneName}`
                    : existingBookmarkSlug
                      ? isZh
                        ? '保存修改'
                        : 'Save Changes'
                      : isZh
                        ? '确认添加'
                        : 'Add Bookmark'}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </main>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) createRoot(rootElement).render(<PopupApp />)
