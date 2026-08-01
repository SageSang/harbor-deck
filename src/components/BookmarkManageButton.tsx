import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FolderTree,
  KeyRound,
  Layers3,
  Plus,
  SquarePen,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfigPanelLayout, ConfigPanelSection } from '@/components/ConfigPanelLayout'
import { ModalShell } from '@/components/ModalShell'
import { BookmarkForm } from '@/features/services/BookmarkFormPanel'
import {
  IMPORTED_BOOKMARK_GROUP_NAME,
  importBrowserBookmarks,
  parseBrowserBookmarksHtml,
} from '@/features/services/browserBookmarkImport'
import {
  buildSuggestedSlug,
  createEmptyBookmarkForm,
  formatBookmarkError,
  validateBookmarkForm,
  type BookmarkFormValues,
} from '@/features/services/bookmarkForm'
import {
  buildUniqueNavigationId,
  cloneNavigationConfig,
  createScene,
  createSceneGroup,
  removeGroupFromScene,
  upsertBookmark,
} from '@/features/navigation/navigationConfig'
import {
  useNavigationConfig,
  useSaveNavigationConfig,
  useSetScenePassword,
} from '@/features/navigation/useNavigation'
import { getFeedbackNoticeClass } from '@/features/feedback/feedbackStyles'
import { useFeedback } from '@/features/feedback/useFeedback'
import { useI18n } from '@/i18n/runtime'
import { useAppStore } from '@/store/appStore'

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

interface BookmarkManageButtonProps {
  initialOpen?: boolean
}

type SectionKey = 'scenes' | 'groups' | 'bookmark' | 'import'

export function BookmarkManageButton({ initialOpen = false }: BookmarkManageButtonProps) {
  const navigationQuery = useNavigationConfig()
  const saveMutation = useSaveNavigationConfig()
  const passwordMutation = useSetScenePassword()
  const activeSceneId = useAppStore((state) => state.activeSceneId)
  const sceneTokens = useAppStore((state) => state.sceneTokens)
  const { showToast, confirm } = useFeedback()
  const { messages } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [activeSection, setActiveSection] = useState<SectionKey>('groups')
  const [selectedSceneId, setSelectedSceneId] = useState<string>('')
  const [newSceneName, setNewSceneName] = useState('')
  const [sceneNameDraft, setSceneNameDraft] = useState('')
  const [scenePassword, setScenePassword] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({})
  const [bookmarkDraft, setBookmarkDraft] = useState<BookmarkFormValues | null>(null)
  const [bookmarkSlugTouched, setBookmarkSlugTouched] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  const navigation = navigationQuery.data
  const manageableNavigation = useMemo(() => {
    if (!navigation) return undefined
    const scenes = navigation.scenes.filter(
      (scene) => !scene.protected || Boolean(sceneTokens[scene.id])
    )
    if (scenes.length === 0) return undefined
    return {
      ...navigation,
      defaultSceneId: scenes.some((scene) => scene.id === navigation.defaultSceneId)
        ? navigation.defaultSceneId
        : scenes[0].id,
      scenes,
    }
  }, [navigation, sceneTokens])
  const selectedScene = manageableNavigation?.scenes.find(
    (scene) => scene.id === selectedSceneId
  )

  useEffect(() => {
    if (!manageableNavigation) return
    const nextSceneId = manageableNavigation.scenes.some(
      (scene) => scene.id === selectedSceneId
    )
      ? selectedSceneId
      : manageableNavigation.scenes.find((scene) => scene.id === activeSceneId)?.id ??
        manageableNavigation.defaultSceneId
    const scene = manageableNavigation.scenes.find((item) => item.id === nextSceneId)!
    setSelectedSceneId(nextSceneId)
    setSceneNameDraft(scene.name)
    setGroupDrafts(Object.fromEntries(scene.groups.map((group) => [group.id, group.name])))
    setBookmarkDraft(
      (current) => current ?? createEmptyBookmarkForm(manageableNavigation, nextSceneId)
    )
  }, [activeSceneId, manageableNavigation, selectedSceneId])

  useEffect(() => {
    if (!isOpen || !manageableNavigation || !activeSceneId) return
    if (manageableNavigation.scenes.some((scene) => scene.id === activeSceneId)) {
      setSelectedSceneId(activeSceneId)
    }
  }, [activeSceneId, isOpen, manageableNavigation])

  useEffect(() => {
    if (!selectedScene) return
    setSceneNameDraft(selectedScene.name)
    setGroupDrafts(
      Object.fromEntries(selectedScene.groups.map((group) => [group.id, group.name]))
    )
  }, [selectedScene])

  function notify(type: FeedbackState['type'], message: string) {
    setFeedback({ type, message })
    showToast({ type, message })
  }

  function saveNavigation(
    nextNavigation: NonNullable<typeof navigation>,
    successMessage: string,
    afterSave?: () => void
  ) {
    saveMutation.mutate(nextNavigation, {
      onSuccess: () => {
        notify('success', successMessage)
        afterSave?.()
      },
      onError: (error) =>
        notify('error', error instanceof Error ? error.message : messages.common.saveFailedRetry),
    })
  }

  function handleSceneSelection(sceneId: string) {
    setSelectedSceneId(sceneId)
    setFeedback(null)
    if (manageableNavigation) {
      setBookmarkDraft(createEmptyBookmarkForm(manageableNavigation, sceneId))
      setBookmarkSlugTouched(false)
    }
  }

  function handleAddScene() {
    if (!navigation || !newSceneName.trim()) return
    if (navigation.scenes.some((scene) => scene.name === newSceneName.trim())) {
      notify('error', '场景名称已存在')
      return
    }
    const scene = createScene(navigation, newSceneName)
    const next = cloneNavigationConfig(navigation)
    next.scenes.push(scene)
    saveNavigation(next, `场景“${scene.name}”已创建。`, () => {
      setNewSceneName('')
      setSelectedSceneId(scene.id)
      setActiveSection('groups')
    })
  }

  function handleRenameScene() {
    if (!navigation || !selectedScene || !sceneNameDraft.trim()) return
    if (
      navigation.scenes.some(
        (scene) => scene.id !== selectedScene.id && scene.name === sceneNameDraft.trim()
      )
    ) {
      notify('error', '场景名称已存在')
      return
    }
    const next = cloneNavigationConfig(navigation)
    next.scenes.find((scene) => scene.id === selectedScene.id)!.name = sceneNameDraft.trim()
    saveNavigation(next, '场景名称已更新。')
  }

  function handleDuplicateScene() {
    if (!navigation || !selectedScene) return
    const baseName = `${selectedScene.name} 副本`
    let name = baseName
    let suffix = 2
    while (navigation.scenes.some((scene) => scene.name === name)) {
      name = `${baseName} ${suffix}`
      suffix += 1
    }
    const scene = createScene(navigation, name)
    scene.groups = selectedScene.groups.map((group) => ({
      id: buildUniqueNavigationId(
        `${scene.id}-${group.id}`,
        selectedScene.groups.map((item) => item.id),
        'group'
      ),
      name: group.name,
      bookmarkIds: [...group.bookmarkIds],
    }))
    const next = cloneNavigationConfig(navigation)
    next.scenes.push(scene)
    saveNavigation(next, `场景“${scene.name}”已复制。`, () => setSelectedSceneId(scene.id))
  }

  async function handleDeleteScene() {
    if (!navigation || !selectedScene || navigation.scenes.length <= 1) return
    const accepted = await confirm({
      title: '删除场景',
      message: `确定删除“${selectedScene.name}”吗？场景内分组会被删除，共享书签仍保留。`,
      confirmLabel: messages.common.delete,
      cancelLabel: messages.common.cancel,
      variant: 'destructive',
    })
    if (!accepted) return
    const next = cloneNavigationConfig(navigation)
    next.scenes = next.scenes.filter((scene) => scene.id !== selectedScene.id)
    if (next.defaultSceneId === selectedScene.id) {
      next.defaultSceneId = next.scenes[0].id
    }
    saveNavigation(next, `场景“${selectedScene.name}”已删除。`, () =>
      setSelectedSceneId(next.defaultSceneId)
    )
  }

  function moveScene(direction: -1 | 1) {
    if (!navigation || !selectedScene) return
    const index = navigation.scenes.findIndex((scene) => scene.id === selectedScene.id)
    const target = index + direction
    if (target < 0 || target >= navigation.scenes.length) return
    const next = cloneNavigationConfig(navigation)
    const [scene] = next.scenes.splice(index, 1)
    next.scenes.splice(target, 0, scene)
    saveNavigation(next, '场景顺序已更新。')
  }

  function setDefaultScene() {
    if (!navigation || !selectedScene) return
    saveNavigation(
      { ...cloneNavigationConfig(navigation), defaultSceneId: selectedScene.id },
      `“${selectedScene.name}”已设为默认场景。`
    )
  }

  function saveScenePassword(password: string | null) {
    if (!selectedScene) return
    passwordMutation.mutate(
      { sceneId: selectedScene.id, password },
      {
        onSuccess: () => {
          setScenePassword('')
          notify('success', password ? '场景密码已设置。' : '场景密码已移除。')
        },
        onError: (error) =>
          notify('error', error instanceof Error ? error.message : '场景密码保存失败'),
      }
    )
  }

  function handleAddGroup() {
    if (!navigation || !selectedScene || !newGroupName.trim()) return
    if (selectedScene.groups.some((group) => group.name === newGroupName.trim())) {
      notify('error', '当前场景已存在同名分组')
      return
    }
    const next = cloneNavigationConfig(navigation)
    const scene = next.scenes.find((item) => item.id === selectedScene.id)!
    scene.groups.push(createSceneGroup(scene, newGroupName))
    saveNavigation(next, `分组“${newGroupName.trim()}”已创建。`, () => setNewGroupName(''))
  }

  function handleRenameGroup(groupId: string) {
    if (!navigation || !selectedScene) return
    const name = groupDrafts[groupId]?.trim()
    if (!name) return
    if (selectedScene.groups.some((group) => group.id !== groupId && group.name === name)) {
      notify('error', '当前场景已存在同名分组')
      return
    }
    const next = cloneNavigationConfig(navigation)
    next.scenes
      .find((scene) => scene.id === selectedScene.id)!
      .groups.find((group) => group.id === groupId)!.name = name
    saveNavigation(next, '分组名称已更新。')
  }

  async function handleDeleteGroup(groupId: string) {
    if (!navigation || !selectedScene) return
    const group = selectedScene.groups.find((item) => item.id === groupId)
    if (!group) return
    const accepted = await confirm({
      title: messages.serviceGrid.confirmDeleteGroupTitle,
      message: messages.serviceGrid.confirmDeleteGroupMessage(
        group.name,
        group.bookmarkIds.length
      ),
      confirmLabel: messages.serviceGrid.deleteGroupAction,
      cancelLabel: messages.common.cancel,
      variant: 'destructive',
    })
    if (!accepted) return
    const next = removeGroupFromScene(navigation, selectedScene.id, groupId)
    saveNavigation(next, `分组“${group.name}”已删除。`)
  }

  function moveGroup(groupId: string, direction: -1 | 1) {
    if (!navigation || !selectedScene) return
    const index = selectedScene.groups.findIndex((group) => group.id === groupId)
    const target = index + direction
    if (target < 0 || target >= selectedScene.groups.length) return
    const next = cloneNavigationConfig(navigation)
    const groups = next.scenes.find((scene) => scene.id === selectedScene.id)!.groups
    const [group] = groups.splice(index, 1)
    groups.splice(target, 0, group)
    saveNavigation(next, '分组顺序已更新。')
  }

  function handleBookmarkFieldChange<K extends keyof BookmarkFormValues>(
    field: K,
    value: BookmarkFormValues[K]
  ) {
    if (!navigation) return
    setBookmarkDraft((current) => {
      if (!current) return current
      const next = { ...current, [field]: value }
      if (field === 'name' && !bookmarkSlugTouched) {
        next.slug = buildSuggestedSlug(String(value), navigation, undefined, current.slug)
      }
      return next
    })
    if (field === 'slug') setBookmarkSlugTouched(String(value).trim().length > 0)
    setFeedback(null)
  }

  function handleAddBookmark() {
    if (!navigation || !bookmarkDraft) return
    try {
      const result = validateBookmarkForm(bookmarkDraft, manageableNavigation ?? navigation)
      let base = cloneNavigationConfig(navigation)
      const placements = result.placements.map((placement) => ({ ...placement }))
      result.groupsToCreate.forEach(({ sceneId, name }) => {
        const scene = base.scenes.find((item) => item.id === sceneId)!
        const group = createSceneGroup(scene, name)
        scene.groups.push(group)
        const placement = placements.find((item) => item.sceneId === sceneId)
        if (placement) placement.groupId = group.id
      })
      base = upsertBookmark(base, result.bookmark, placements)
      saveNavigation(base, `书签“${result.bookmark.name}”已创建。`, () => {
        setBookmarkDraft(createEmptyBookmarkForm(base, selectedSceneId))
        setBookmarkSlugTouched(false)
        setIsOpen(false)
      })
    } catch (error) {
      notify('error', formatBookmarkError(error))
    }
  }

  async function handleImportBookmarksFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !navigation || !selectedScene) return
    try {
      const bookmarks = parseBrowserBookmarksHtml(await file.text())
      const next = importBrowserBookmarks(navigation, bookmarks, selectedScene.id)
      saveNavigation(
        next,
        `已向“${selectedScene.name}”导入 ${bookmarks.length} 个浏览器书签。`
      )
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : messages.bookmarkManage.importSection.importFailed
      )
    }
  }

  const panelTabs = useMemo(
    () => [
      { key: 'scenes' as const, label: '场景管理', description: '新增、复制、保护和删除', icon: Layers3 },
      { key: 'groups' as const, label: messages.bookmarkManage.groupSection.label, description: '维护当前场景分组', icon: FolderTree },
      { key: 'bookmark' as const, label: messages.bookmarkManage.bookmarkSection.label, description: '添加到一个或多个场景', icon: SquarePen },
      { key: 'import' as const, label: messages.bookmarkManage.importSection.label, description: '导入到所选场景', icon: Upload },
    ],
    [messages]
  )

  if (!navigation || !manageableNavigation || !selectedScene || !bookmarkDraft) {
    return (
      <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full">
        <Plus className="h-4 w-4" />
      </Button>
    )
  }

  const sceneSelector = (
    <select
      value={selectedScene.id}
      onChange={(event) => handleSceneSelection(event.target.value)}
      className="config-panel-select max-w-xs"
    >
      {manageableNavigation.scenes.map((scene) => (
        <option key={scene.id} value={scene.id}>
          {scene.name}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={messages.bookmarkManage.buttonAria}
        onClick={() => setIsOpen(true)}
        className="h-10 w-10 rounded-full"
      >
        <Plus className="h-4.5 w-4.5" />
      </Button>

      <ModalShell
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={messages.bookmarkManage.title}
        description="按场景维护分组和共享书签。"
        icon={Plus}
        widthClassName="max-w-6xl"
      >
        <ConfigPanelLayout
          panelTitle={messages.bookmarkManage.panelTitle}
          tabs={panelTabs}
          activeTab={activeSection}
          onTabChange={setActiveSection}
        >
          {activeSection === 'scenes' ? (
            <ConfigPanelSection title="场景管理" summary="场景可自由新增、复制、排序、保护和删除。" headerActions={sceneSelector}>
              <div className="space-y-4">
                <div className="config-panel-card grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input value={newSceneName} onChange={(event) => setNewSceneName(event.target.value)} placeholder="新场景名称" />
                  <Button type="button" onClick={handleAddScene} disabled={!newSceneName.trim() || saveMutation.isPending}>
                    <Plus className="h-4 w-4" />新增场景
                  </Button>
                </div>
                <div className="config-panel-card space-y-4 p-4">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input value={sceneNameDraft} onChange={(event) => setSceneNameDraft(event.target.value)} />
                    <Button type="button" variant="outline" onClick={handleRenameScene}>保存名称</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => moveScene(-1)}><ArrowUp className="h-4 w-4" />前移</Button>
                    <Button type="button" variant="outline" onClick={() => moveScene(1)}><ArrowDown className="h-4 w-4" />后移</Button>
                    <Button type="button" variant="outline" onClick={handleDuplicateScene}><Copy className="h-4 w-4" />复制场景</Button>
                    <Button type="button" variant="outline" onClick={setDefaultScene} disabled={navigation.defaultSceneId === selectedScene.id}>设为默认</Button>
                    <Button type="button" variant="destructive" onClick={() => void handleDeleteScene()} disabled={navigation.scenes.length <= 1}><Trash2 className="h-4 w-4" />删除场景</Button>
                  </div>
                </div>
                <div className="config-panel-card space-y-3 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" />场景密码</div>
                  <p className="text-xs leading-5 text-muted-foreground">密码只在进入该场景时请求，普通场景切换不受影响。</p>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <Input type="password" value={scenePassword} onChange={(event) => setScenePassword(event.target.value)} placeholder={selectedScene.protected ? '输入新密码以替换' : '至少 6 位'} />
                    <Button type="button" onClick={() => saveScenePassword(scenePassword)} disabled={scenePassword.length < 6 || passwordMutation.isPending}>设置密码</Button>
                    <Button type="button" variant="outline" onClick={() => saveScenePassword(null)} disabled={!selectedScene.protected || passwordMutation.isPending}>移除密码</Button>
                  </div>
                </div>
              </div>
            </ConfigPanelSection>
          ) : activeSection === 'groups' ? (
            <ConfigPanelSection title={`${selectedScene.name} · 分组管理`} summary="每个场景拥有独立分组；删除分组不会彻底删除共享书签。" headerActions={sceneSelector}>
              <div className="config-panel-card mb-3 grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder={messages.bookmarkManage.groupSection.createPlaceholder} />
                <Button type="button" onClick={handleAddGroup}><Plus className="h-4 w-4" />{messages.bookmarkManage.groupSection.createButton}</Button>
              </div>
              <div className="space-y-2">
                {selectedScene.groups.map((group, index) => (
                  <div key={group.id} className="config-panel-card grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div><Input value={groupDrafts[group.id] ?? ''} onChange={(event) => setGroupDrafts((current) => ({ ...current, [group.id]: event.target.value }))} /><p className="mt-1 text-xs text-muted-foreground">{group.bookmarkIds.length} 个书签</p></div>
                    <div className="flex flex-wrap items-start gap-1.5">
                      <Button type="button" size="icon" variant="outline" disabled={index === 0} onClick={() => moveGroup(group.id, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="outline" disabled={index === selectedScene.groups.length - 1} onClick={() => moveGroup(group.id, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button type="button" variant="outline" onClick={() => handleRenameGroup(group.id)}>保存</Button>
                      <Button type="button" variant="destructive" onClick={() => void handleDeleteGroup(group.id)}>删除</Button>
                    </div>
                  </div>
                ))}
              </div>
            </ConfigPanelSection>
          ) : activeSection === 'bookmark' ? (
            <ConfigPanelSection title="添加书签" summary="每个发布位置分别选择场景及其分组。" headerActions={sceneSelector} bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <BookmarkForm config={manageableNavigation} values={bookmarkDraft} feedback={feedback} submitLabel={messages.bookmarkManage.bookmarkSection.submitButton} submitDisabled={saveMutation.isPending} onSubmit={handleAddBookmark} onCancel={() => setIsOpen(false)} onFieldChange={handleBookmarkFieldChange} />
            </ConfigPanelSection>
          ) : (
            <ConfigPanelSection title="导入浏览器书签" summary="先选择目标场景，多层文件夹会按完整路径生成该场景内的一级分组。" headerActions={sceneSelector} footer={<div className={getFeedbackNoticeClass(feedback?.type)}>{feedback?.message ?? `无文件夹书签会进入“${IMPORTED_BOOKMARK_GROUP_NAME}”。`}</div>}>
              <input ref={fileInputRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={handleImportBookmarksFile} />
              <div className="config-panel-card space-y-3 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Upload className="h-4 w-4" />导入到“{selectedScene.name}”</div>
                <p className="text-xs leading-5 text-muted-foreground">例如“书签栏 / 开发 / 前端”会成为一个一级分组；相同 URL 会复用已有书签。</p>
                <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={saveMutation.isPending}><Upload className="h-4 w-4" />选择 HTML 文件</Button>
              </div>
            </ConfigPanelSection>
          )}
        </ConfigPanelLayout>
      </ModalShell>
    </>
  )
}
